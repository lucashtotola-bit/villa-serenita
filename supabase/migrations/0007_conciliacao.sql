-- =============================================================================
-- Villa Serenità — Módulo 5: conciliação bancária
-- =============================================================================
-- Decisões 13 e 14 de spec/decisoes-modelagem.md:
--   - linha de extrato sem correspondente vira lançamento já conciliado
--   - reimportar um extrato ignora os movimentos repetidos
--
-- O arquivo OFX traz, para cada movimento, um identificador único e estável
-- (FITID). É ele que permite reimportar um período sobreposto sem duplicar.
--
-- A restrição de "desfazer conciliação após o fechamento é privilégio do
-- Lucas" entra na 0008, junto com a tabela `fechamentos`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- extratos_importados
-- -----------------------------------------------------------------------------

create table public.extratos_importados (
  id                uuid        primary key default gen_random_uuid(),
  conta_id          uuid        not null references public.contas_bancarias(id),
  arquivo_nome      text        not null,
  periodo_inicio    date,
  periodo_fim       date,
  linhas_importadas int         not null default 0,
  linhas_ignoradas  int         not null default 0,
  importado_em      timestamptz not null default now(),
  importado_por     uuid        default public.socio_atual_id() references public.socios(id),

  constraint extrato_periodo_valido check (
    periodo_inicio is null or periodo_fim is null or periodo_fim >= periodo_inicio
  )
);

create index extrato_conta on public.extratos_importados (conta_id);

comment on column public.extratos_importados.linhas_ignoradas is
  'Movimentos que já existiam de uma importação anterior. Reimportar um '
  'período sobreposto é seguro.';

-- -----------------------------------------------------------------------------
-- extrato_linhas
-- -----------------------------------------------------------------------------

create table public.extrato_linhas (
  id                  uuid          primary key default gen_random_uuid(),
  extrato_id          uuid          not null references public.extratos_importados(id) on delete cascade,
  -- Repetida da importação porque o identificador do banco é único por CONTA,
  -- não por arquivo: é essa coluna que sustenta a trava contra duplicidade.
  conta_id            uuid          not null references public.contas_bancarias(id),
  data                date          not null,
  descricao           text          not null,
  -- Com sinal, como o banco informa: negativo é débito, positivo é crédito.
  valor               numeric(14,2) not null,
  identificador_banco text          not null,

  lancamento_id       uuid          references public.lancamentos(id),
  conciliado_em       timestamptz,
  conciliado_por      uuid          references public.socios(id),
  /** Linha que o usuário decidiu não conciliar (ex.: movimento de outra conta). */
  ignorada            boolean       not null default false,
  criado_em           timestamptz   not null default now(),

  constraint linha_valor_nao_zero check (valor <> 0),
  constraint linha_identificador_preenchido check (length(trim(identificador_banco)) > 0),
  constraint linha_conciliacao_coerente check (
    (lancamento_id is null and conciliado_em is null)
    or (lancamento_id is not null and conciliado_em is not null)
  ),
  -- Ou a linha é ignorada, ou é conciliada. Nunca as duas coisas.
  constraint linha_ignorada_ou_conciliada check (not (ignorada and lancamento_id is not null))
);

-- O coração da decisão 14: o mesmo movimento nunca entra duas vezes.
create unique index linha_identificador_unico
  on public.extrato_linhas (conta_id, identificador_banco);

-- Um lançamento se concilia com uma única linha de extrato.
create unique index linha_lancamento_unico
  on public.extrato_linhas (lancamento_id) where lancamento_id is not null;

create index linha_extrato on public.extrato_linhas (extrato_id);
create index linha_pendentes on public.extrato_linhas (conta_id, data)
  where lancamento_id is null and not ignorada;

-- -----------------------------------------------------------------------------
-- Conciliar liga os dois lados
-- -----------------------------------------------------------------------------
-- Apontar uma linha para um lançamento marca o lançamento como conciliado —
-- e é essa marca que o torna somente leitura (trigger da migração 0003).

create or replace function public.tg_linha_concilia_lancamento()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  l         public.lancamentos%rowtype;
  v_antigo  uuid;
  v_entrada boolean;
begin
  v_antigo := case when tg_op = 'INSERT' then null else old.lancamento_id end;

  -- Desfez o vínculo: o lançamento volta a ser editável.
  if v_antigo is not null and new.lancamento_id is distinct from v_antigo then
    update public.lancamentos
       set conciliado = false, conciliado_em = null, conciliado_por = null
     where id = v_antigo;
  end if;

  if new.lancamento_id is null then
    return null;
  end if;

  select * into l from public.lancamentos where id = new.lancamento_id;

  if l.conta_id <> new.conta_id then
    raise exception 'O lançamento é de outra conta bancária.';
  end if;

  if l.valor <> abs(new.valor) then
    raise exception
      'Valores diferentes: extrato R$ %, lançamento R$ %.',
      to_char(abs(new.valor), 'FM999G999G990D00'), to_char(l.valor, 'FM999G999G990D00');
  end if;

  -- Crédito no banco tem de casar com entrada de dinheiro, e vice-versa.
  v_entrada := (l.tipo = 'Receita') or (l.tipo = 'Transferência' and l.sentido = 'Entrada');
  if v_entrada <> (new.valor > 0) then
    raise exception
      'Sentido incompatível: o extrato mostra %, mas o lançamento é %.',
      case when new.valor > 0 then 'entrada' else 'saída' end,
      lower(l.tipo);
  end if;

  update public.lancamentos
     set conciliado     = true,
         conciliado_em  = coalesce(new.conciliado_em, now()),
         conciliado_por = coalesce(new.conciliado_por, public.socio_atual_id())
   where id = new.lancamento_id;

  return null;
end;
$$;

create trigger linha_concilia_lancamento
  after insert or update of lancamento_id on public.extrato_linhas
  for each row execute function public.tg_linha_concilia_lancamento();

-- -----------------------------------------------------------------------------
-- Criar o lançamento a partir da linha (decisão 13)
-- -----------------------------------------------------------------------------
-- Transforma a conciliação na forma mais rápida de lançar o mês: data, valor e
-- descrição vêm do banco; o usuário só classifica. Fica no banco, e não na
-- aplicação, para que as duas gravações nunca aconteçam pela metade.

create or replace function public.conciliar_criando_lancamento(
  p_linha_id     uuid,
  p_categoria_id uuid,
  p_centro_id    uuid,
  p_descricao    text default null,
  p_clifor_id    uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  li     public.extrato_linhas%rowtype;
  v_lanc uuid;
begin
  if not public.usuario_autorizado() then
    raise exception 'Sem permissão.';
  end if;

  select * into li from public.extrato_linhas where id = p_linha_id;
  if li.id is null then
    raise exception 'Linha de extrato não encontrada.';
  end if;
  if li.lancamento_id is not null then
    raise exception 'Esta linha já está conciliada.';
  end if;

  insert into public.lancamentos (
    tipo, situacao, descricao, valor, data_vencimento, data_pagamento,
    conta_id, categoria_id, centro_id, clifor_id, criado_por
  ) values (
    case when li.valor > 0 then 'Receita' else 'Despesa' end,
    'Realizada',
    coalesce(nullif(trim(p_descricao), ''), li.descricao),
    abs(li.valor), li.data, li.data,
    li.conta_id, p_categoria_id, p_centro_id, p_clifor_id, public.socio_atual_id()
  )
  returning id into v_lanc;

  update public.extrato_linhas
     set lancamento_id  = v_lanc,
         conciliado_em  = now(),
         conciliado_por = public.socio_atual_id()
   where id = p_linha_id;

  return v_lanc;
end;
$$;

comment on function public.conciliar_criando_lancamento is
  'Cria o lançamento a partir de uma linha de extrato e já concilia os dois.';

-- -----------------------------------------------------------------------------
-- Rotina
-- -----------------------------------------------------------------------------

create trigger extratos_audit
  after insert or update or delete on public.extratos_importados
  for each row execute function public.tg_audit();
create trigger linhas_audit
  after insert or update or delete on public.extrato_linhas
  for each row execute function public.tg_audit();

-- -----------------------------------------------------------------------------
-- Segurança
-- -----------------------------------------------------------------------------

alter table public.extratos_importados enable row level security;
alter table public.extrato_linhas      enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['extratos_importados', 'extrato_linhas']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.usuario_autorizado())',
      t || '_leitura', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.usuario_autorizado())',
      t || '_insercao', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.usuario_autorizado()) with check (public.usuario_autorizado())',
      t || '_edicao', t
    );
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

grant execute on function public.conciliar_criando_lancamento(uuid, uuid, uuid, text, uuid)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------

do $$
declare
  v_conta  uuid;
  v_conta2 uuid;
  v_cat    uuid;
  v_centro uuid;
  v_extr   uuid;
  v_linha  uuid;
  v_linha2 uuid;
  v_lanc   uuid;
  v_novo   uuid;
  v_ok     boolean;
begin
  -- Simula o usuário logado: as funções de permissão leem o e-mail do token,
  -- e sem isso `conciliar_criando_lancamento` recusaria a própria conferência.
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'email', (select email from public.socios where pode_entrar limit 1)
    )::text,
    true
  );

  insert into public.contas_bancarias (banco, apelido, tipo, saldo_inicial, data_saldo_inicial)
    values ('__teste__', 'conc', 'Corrente', 0, date '2020-01-01') returning id into v_conta;
  insert into public.contas_bancarias (banco, apelido, tipo, saldo_inicial, data_saldo_inicial)
    values ('__teste__', 'outra', 'Corrente', 0, date '2020-01-01') returning id into v_conta2;
  insert into public.categorias (nome, tipo) values ('__teste__', 'Despesa') returning id into v_cat;
  insert into public.centros_custo (nome, tipo) values ('__teste__', 'Despesa') returning id into v_centro;

  insert into public.extratos_importados (conta_id, arquivo_nome)
    values (v_conta, '__teste__.ofx') returning id into v_extr;

  insert into public.extrato_linhas (extrato_id, conta_id, data, descricao, valor, identificador_banco)
    values (v_extr, v_conta, date '2026-07-10', '__teste__ compra', -320.00, 'FITID-001')
    returning id into v_linha;

  -- 1. O mesmo identificador na mesma conta não pode entrar duas vezes.
  v_ok := false;
  begin
    insert into public.extrato_linhas (extrato_id, conta_id, data, descricao, valor, identificador_banco)
      values (v_extr, v_conta, date '2026-07-10', '__teste__ repetida', -320.00, 'FITID-001');
  exception when unique_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'Movimento repetido deveria ter sido recusado'; end if;

  -- 2. Conciliar com valor diferente tem de ser recusado.
  insert into public.lancamentos (tipo, descricao, valor, data_vencimento, data_pagamento,
    conta_id, categoria_id, centro_id)
    values ('Despesa', '__teste__', 999.00, date '2026-07-10', date '2026-07-10',
            v_conta, v_cat, v_centro)
    returning id into v_lanc;

  v_ok := false;
  begin
    update public.extrato_linhas
       set lancamento_id = v_lanc, conciliado_em = now() where id = v_linha;
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'Conciliação com valor diferente deveria ser recusada'; end if;

  -- 3. Conciliar débito do extrato com uma receita tem de ser recusado.
  update public.lancamentos set valor = 320.00 where id = v_lanc;
  update public.lancamentos set tipo = 'Receita' where id = v_lanc;

  v_ok := false;
  begin
    update public.extrato_linhas
       set lancamento_id = v_lanc, conciliado_em = now() where id = v_linha;
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'Sentido incompatível deveria ser recusado'; end if;

  -- 4. Conciliação correta marca o lançamento e o torna somente leitura.
  update public.lancamentos set tipo = 'Despesa' where id = v_lanc;
  update public.extrato_linhas
     set lancamento_id = v_lanc, conciliado_em = now() where id = v_linha;

  if not (select conciliado from public.lancamentos where id = v_lanc) then
    raise exception 'O lançamento deveria ter ficado conciliado';
  end if;

  v_ok := false;
  begin
    update public.lancamentos set descricao = 'mudou' where id = v_lanc;
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'Lançamento conciliado deveria estar travado'; end if;

  -- 5. Criar lançamento a partir de uma linha órfã, já conciliado.
  insert into public.extrato_linhas (extrato_id, conta_id, data, descricao, valor, identificador_banco)
    values (v_extr, v_conta, date '2026-07-11', '__teste__ orfa', 150.00, 'FITID-002')
    returning id into v_linha2;

  v_novo := public.conciliar_criando_lancamento(v_linha2, v_cat, v_centro);

  if not exists (
    select 1 from public.lancamentos
     where id = v_novo and tipo = 'Receita' and valor = 150.00
       and situacao = 'Realizada' and conciliado
  ) then
    raise exception 'A linha órfã deveria ter virado receita realizada e conciliada';
  end if;

  -- 6. Desfazer o vínculo destrava o lançamento.
  update public.extrato_linhas
     set lancamento_id = null, conciliado_em = null, conciliado_por = null
   where id = v_linha2;

  if (select conciliado from public.lancamentos where id = v_novo) then
    raise exception 'Desfazer o vínculo deveria ter destravado o lançamento';
  end if;

  -- Limpeza.
  delete from public.extrato_linhas where extrato_id = v_extr;
  delete from public.extratos_importados where id = v_extr;
  delete from public.lancamentos where conta_id in (v_conta, v_conta2);
  delete from public.contas_bancarias where banco = '__teste__';
  delete from public.categorias where nome = '__teste__';
  delete from public.centros_custo where nome = '__teste__';
  delete from public.audit_log
    where dados_depois::text like '%__teste__%' or dados_antes::text like '%__teste__%';

  raise notice 'OK: duplicidade barrada, valor e sentido conferidos, linha orfa vira lancamento.';
end;
$$;
