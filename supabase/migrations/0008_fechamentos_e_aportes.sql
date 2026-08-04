-- =============================================================================
-- Villa Serenità — Módulo 6: prestação de contas e aportes
-- =============================================================================
-- Decisões 15 e 16 de spec/decisoes-modelagem.md: fechamento mensal com o
-- resultado congelado, e devolução de aporte sem necessidade de aval.
--
-- Um ponto que só apareceu ao modelar: um aporte ENTRA na conta bancária, mas
-- não é receita. Se ficasse fora dos lançamentos, o saldo do banco deixaria de
-- bater com o extrato. A solução segue a mesma lógica da transferência: aporte
-- e devolução viram tipos de lançamento que mexem no saldo e ficam de fora do
-- resultado e do rateio.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Aporte e devolução como tipos de lançamento
-- -----------------------------------------------------------------------------

alter table public.lancamentos drop constraint lanc_tipo_valido;
alter table public.lancamentos add constraint lanc_tipo_valido check (
  tipo in ('Receita', 'Despesa', 'Transferência', 'Aporte', 'Devolução')
);

-- Só receita e despesa exigem classificação contábil: os demais tipos são
-- movimentação de caixa e não entram em relatório por categoria.
alter table public.lancamentos drop constraint lanc_classificacao_coerente;
alter table public.lancamentos add constraint lanc_classificacao_coerente check (
  case when tipo in ('Receita', 'Despesa')
    then categoria_id is not null and centro_id is not null
    else categoria_id is null and centro_id is null
  end
);

comment on column public.lancamentos.tipo is
  'Receita e Despesa formam o resultado. Transferência, Aporte e Devolução '
  'movem o saldo das contas mas ficam fora do resultado e do rateio.';

-- A view precisa saber que aporte soma e devolução subtrai.
drop view public.saldos_contas;
create view public.saldos_contas
with (security_invoker = true) as
select
  c.id                as conta_id,
  c.banco,
  c.apelido,
  c.tipo,
  c.saldo_inicial,
  c.data_saldo_inicial,
  c.saldo_inicial + coalesce(sum(
    case
      when l.tipo in ('Receita', 'Aporte')     then  l.valor
      when l.tipo in ('Despesa', 'Devolução')  then -l.valor
      when l.sentido = 'Entrada'               then  l.valor
      else                                          -l.valor
    end
  ), 0)               as saldo_atual
from public.contas_bancarias c
left join public.lancamentos l
       on l.conta_id = c.id
      and l.ativo
      and l.situacao = 'Realizada'
      and l.data_pagamento > c.data_saldo_inicial
where c.ativo
group by c.id, c.banco, c.apelido, c.tipo, c.saldo_inicial, c.data_saldo_inicial;

grant select on public.saldos_contas to authenticated;
revoke all on public.saldos_contas from anon;

-- -----------------------------------------------------------------------------
-- aportes
-- -----------------------------------------------------------------------------

create table public.aportes (
  id            uuid          primary key default gen_random_uuid(),
  socio_id      uuid          not null references public.socios(id),
  tipo          text          not null,
  valor         numeric(14,2) not null,
  data          date          not null default current_date,
  conta_id      uuid          not null references public.contas_bancarias(id),
  observacao    text,
  lancamento_id uuid          references public.lancamentos(id),
  ativo         boolean       not null default true,
  criado_em     timestamptz   not null default now(),
  criado_por    uuid          default public.socio_atual_id() references public.socios(id),

  constraint aporte_tipo_valido check (tipo in ('Aporte', 'Devolução')),
  constraint aporte_valor_positivo check (valor > 0)
);

create index aporte_socio on public.aportes (socio_id);

comment on table public.aportes is
  'Crédito individual do sócio, calculado FORA do rateio de lucro. Quem aporta '
  'precisa reaver o valor, e isso não pode distorcer o resultado.';

create view public.saldo_aportes
with (security_invoker = true) as
select
  s.id                as socio_id,
  s.nome_curto,
  s.nome_completo,
  coalesce(sum(case when a.tipo = 'Aporte' then a.valor else -a.valor end), 0) as saldo_em_aberto
from public.socios s
left join public.aportes a on a.socio_id = s.id and a.ativo
where s.ativo
group by s.id, s.nome_curto, s.nome_completo;

comment on view public.saldo_aportes is
  'Quanto cada sócio ainda tem a receber de volta dos aportes que fez.';

-- Regra inviolável: devolução não pode exceder o aporte em aberto do sócio.
create or replace function public.tg_aporte_valida_devolucao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_saldo numeric(14,2);
  v_nome  text;
begin
  if new.tipo <> 'Devolução' then
    return new;
  end if;

  select coalesce(sum(case when tipo = 'Aporte' then valor else -valor end), 0)
    into v_saldo
    from public.aportes
   where socio_id = new.socio_id
     and ativo
     and id <> new.id;

  if new.valor > v_saldo then
    select nome_curto into v_nome from public.socios where id = new.socio_id;
    raise exception
      'Devolução de R$ % excede o aporte em aberto de % (R$ %).',
      to_char(new.valor, 'FM999G999G990D00'),
      v_nome,
      to_char(v_saldo, 'FM999G999G990D00');
  end if;

  return new;
end;
$$;

create trigger aporte_valida_devolucao
  before insert or update on public.aportes
  for each row execute function public.tg_aporte_valida_devolucao();

-- Aporte e devolução mexem no saldo da conta, então viram lançamento.
create or replace function public.tg_aporte_gera_lancamento()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome text;
  v_lanc uuid;
begin
  select nome_curto into v_nome from public.socios where id = new.socio_id;

  insert into public.lancamentos (
    tipo, situacao, descricao, valor, data_vencimento, data_pagamento,
    conta_id, criado_por
  ) values (
    new.tipo, 'Realizada',
    format('%s — %s', new.tipo, v_nome),
    new.valor, new.data, new.data,
    new.conta_id, new.criado_por
  )
  returning id into v_lanc;

  update public.aportes set lancamento_id = v_lanc where id = new.id;
  return null;
end;
$$;

create trigger aporte_gera_lancamento
  after insert on public.aportes
  for each row execute function public.tg_aporte_gera_lancamento();

-- -----------------------------------------------------------------------------
-- fechamentos
-- -----------------------------------------------------------------------------

create table public.fechamentos (
  id                  uuid          primary key default gen_random_uuid(),
  competencia         date          not null,
  status              text          not null default 'Fechado',
  -- Fotografia do resultado no momento do fechamento (decisão 15).
  total_receitas      numeric(14,2) not null,
  total_despesas      numeric(14,2) not null,
  resultado           numeric(14,2) not null,
  fechado_em          timestamptz   not null default now(),
  fechado_por         uuid          references public.socios(id),
  reaberto_em         timestamptz,
  reaberto_por        uuid          references public.socios(id),
  motivo_reabertura   text,

  constraint fech_status_valido check (status in ('Fechado', 'Reaberto')),
  constraint fech_competencia_no_dia_1 check (competencia = date_trunc('month', competencia)::date),
  constraint fech_reabertura_com_motivo check (
    status <> 'Reaberto' or length(trim(coalesce(motivo_reabertura, ''))) > 0
  )
);

create unique index fech_competencia_unica on public.fechamentos (competencia);

comment on column public.fechamentos.resultado is
  'Congelado no fechamento. O que os sócios aprovaram continua sendo aquilo, '
  'mesmo que um lançamento seja corrigido depois.';

create table public.fechamento_socios (
  id             uuid          primary key default gen_random_uuid(),
  fechamento_id  uuid          not null references public.fechamentos(id) on delete cascade,
  socio_id       uuid          not null references public.socios(id),
  nome_completo  text          not null,
  cota           numeric(5,2)  not null,
  valor          numeric(14,2) not null,

  constraint fech_socio_cota_valida check (cota > 0 and cota <= 100)
);

create unique index fech_socio_unico on public.fechamento_socios (fechamento_id, socio_id);

comment on column public.fechamento_socios.nome_completo is
  'Copiado no fechamento: o relatório de julho continua mostrando o nome que '
  'valia em julho.';

-- -----------------------------------------------------------------------------
-- Fechar o mês
-- -----------------------------------------------------------------------------

create or replace function public.fechar_periodo(p_competencia date)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inicio     date;
  v_fim        date;
  v_pendentes  int;
  v_receitas   numeric(14,2);
  v_despesas   numeric(14,2);
  v_resultado  numeric(14,2);
  v_fech       uuid;
  v_socio      record;
  v_acumulado  numeric(14,2) := 0;
  v_qtd        int;
  v_i          int := 0;
  v_parte      numeric(14,2);
begin
  if not public.usuario_autorizado() then
    raise exception 'Sem permissão.';
  end if;

  v_inicio := date_trunc('month', p_competencia)::date;
  v_fim    := (v_inicio + interval '1 month')::date;

  if exists (select 1 from public.fechamentos where competencia = v_inicio and status = 'Fechado') then
    raise exception 'A competência % já está fechada.', to_char(v_inicio, 'MM/YYYY');
  end if;

  -- Regra inviolável: só fecha com o mês 100% conciliado.
  select count(*) into v_pendentes
    from public.lancamentos
   where ativo
     and situacao = 'Realizada'
     and not conciliado
     and data_pagamento >= v_inicio
     and data_pagamento <  v_fim;

  if v_pendentes > 0 then
    raise exception
      'Ainda há % lançamento(s) sem conciliar em %. Conclua a conciliação antes de fechar.',
      v_pendentes, to_char(v_inicio, 'MM/YYYY');
  end if;

  -- Só receita e despesa formam o resultado.
  select
    coalesce(sum(valor) filter (where tipo = 'Receita'), 0),
    coalesce(sum(valor) filter (where tipo = 'Despesa'), 0)
  into v_receitas, v_despesas
  from public.lancamentos
  where ativo
    and situacao = 'Realizada'
    and data_pagamento >= v_inicio
    and data_pagamento <  v_fim;

  v_resultado := v_receitas - v_despesas;

  delete from public.fechamentos where competencia = v_inicio;

  insert into public.fechamentos (
    competencia, status, total_receitas, total_despesas, resultado, fechado_por
  )
  values (v_inicio, 'Fechado', v_receitas, v_despesas, v_resultado, public.socio_atual_id())
  returning id into v_fech;

  -- Rateio igual entre os sócios ativos. A sobra de centavos do arredondamento
  -- vai para o último, para a soma das partes bater exatamente com o resultado.
  select count(*) into v_qtd from public.socios where ativo;

  for v_socio in
    select id, nome_completo, cota from public.socios where ativo order by nome_completo
  loop
    v_i := v_i + 1;
    if v_i = v_qtd then
      v_parte := v_resultado - v_acumulado;
    else
      v_parte := round(v_resultado * v_socio.cota / 100, 2);
      v_acumulado := v_acumulado + v_parte;
    end if;

    insert into public.fechamento_socios (fechamento_id, socio_id, nome_completo, cota, valor)
    values (v_fech, v_socio.id, v_socio.nome_completo, v_socio.cota, v_parte);
  end loop;

  return v_fech;
end;
$$;

comment on function public.fechar_periodo is
  'Fecha o mês e congela o resultado. Recusa se houver lançamento não conciliado.';

create or replace function public.reabrir_periodo(p_competencia date, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inicio date;
begin
  -- Regra inviolável: reabrir período fechado é privilégio exclusivo do Lucas.
  if not exists (
    select 1 from public.socios
     where id = public.socio_atual_id() and pode_desfazer_conciliacao
  ) then
    raise exception 'Apenas o sócio autorizado pode reabrir um período fechado.';
  end if;

  if length(trim(coalesce(p_motivo, ''))) = 0 then
    raise exception 'Informe o motivo da reabertura.';
  end if;

  v_inicio := date_trunc('month', p_competencia)::date;

  update public.fechamentos
     set status = 'Reaberto',
         reaberto_em = now(),
         reaberto_por = public.socio_atual_id(),
         motivo_reabertura = p_motivo
   where competencia = v_inicio
     and status = 'Fechado';

  if not found then
    raise exception 'Não há fechamento em aberto para %.', to_char(v_inicio, 'MM/YYYY');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Desfazer conciliação em mês fechado
-- -----------------------------------------------------------------------------
-- Agora que `fechamentos` existe, a trava da 0003 ganha a segunda metade da
-- regra: dentro de um mês já fechado, só o Lucas desfaz.

create or replace function public.tg_lancamento_conciliado_travado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_competencia date;
begin
  if not old.conciliado then
    return new;
  end if;

  -- Continua conciliado: nada pode mudar.
  if new.conciliado then
    if to_jsonb(old) - 'atualizado_em' is distinct from to_jsonb(new) - 'atualizado_em' then
      raise exception
        'Lançamento conciliado é somente leitura. Desfaça a conciliação antes de alterar.';
    end if;
    return new;
  end if;

  -- Está desfazendo. Se a competência já foi fechada, é privilégio do Lucas.
  v_competencia := date_trunc('month', old.data_pagamento)::date;

  if exists (
    select 1 from public.fechamentos
     where competencia = v_competencia and status = 'Fechado'
  ) then
    if not exists (
      select 1 from public.socios
       where id = public.socio_atual_id() and pode_desfazer_conciliacao
    ) then
      raise exception
        'A competência % está fechada. Apenas o sócio autorizado pode desfazer a conciliação.',
        to_char(v_competencia, 'MM/YYYY');
    end if;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Rotina
-- -----------------------------------------------------------------------------

create trigger aportes_audit after insert or update or delete on public.aportes
  for each row execute function public.tg_audit();
create trigger fechamentos_audit after insert or update or delete on public.fechamentos
  for each row execute function public.tg_audit();

-- -----------------------------------------------------------------------------
-- Segurança
-- -----------------------------------------------------------------------------

alter table public.aportes            enable row level security;
alter table public.fechamentos        enable row level security;
alter table public.fechamento_socios  enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['aportes', 'fechamentos', 'fechamento_socios']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.usuario_autorizado())',
      t || '_leitura', t
    );
    execute format('grant select on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- Aportes são lançados pela tela; fechamentos, apenas pelas funções acima.
create policy aportes_insercao on public.aportes
  for insert to authenticated with check (public.usuario_autorizado());
create policy aportes_edicao on public.aportes
  for update to authenticated
  using (public.usuario_autorizado()) with check (public.usuario_autorizado());
grant insert, update on public.aportes to authenticated;

grant select on public.saldo_aportes to authenticated;
revoke all on public.saldo_aportes from anon;

grant execute on function public.fechar_periodo(date) to authenticated;
grant execute on function public.reabrir_periodo(date, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------

do $$
declare
  v_conta  uuid;
  v_cat    uuid;
  v_centro uuid;
  v_lucas  uuid;
  v_outro  uuid;
  v_lanc   uuid;
  v_fech   uuid;
  v_saldo  numeric(14,2);
  v_soma   numeric(14,2);
  v_ok     boolean;
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('email', (select email from public.socios where pode_entrar limit 1))::text,
    true
  );

  select id into v_lucas from public.socios where pode_desfazer_conciliacao limit 1;
  select id into v_outro from public.socios where not pode_desfazer_conciliacao limit 1;

  insert into public.contas_bancarias (banco, apelido, tipo, saldo_inicial, data_saldo_inicial)
    values ('__teste__', 'fech', 'Corrente', 0, date '2020-01-01') returning id into v_conta;
  insert into public.categorias (nome, tipo) values ('__teste__', 'Receita') returning id into v_cat;
  insert into public.centros_custo (nome, tipo) values ('__teste__', 'Receita') returning id into v_centro;

  -- 1. Aporte entra no saldo da conta sem virar receita.
  insert into public.aportes (socio_id, tipo, valor, data, conta_id)
    values (v_lucas, 'Aporte', 10000.00, date '2026-05-10', v_conta);

  select saldo_atual into v_saldo from public.saldos_contas where conta_id = v_conta;
  if v_saldo <> 10000.00 then
    raise exception 'Aporte deveria elevar o saldo a 10.000, está em %', v_saldo;
  end if;

  select saldo_em_aberto into v_saldo from public.saldo_aportes where socio_id = v_lucas;
  if v_saldo <> 10000.00 then
    raise exception 'Saldo de aportes deveria ser 10.000, é %', v_saldo;
  end if;

  -- 2. Devolução maior que o aporte em aberto tem de ser recusada.
  v_ok := false;
  begin
    insert into public.aportes (socio_id, tipo, valor, data, conta_id)
      values (v_lucas, 'Devolução', 15000.00, date '2026-05-20', v_conta);
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'Devolução acima do aporte deveria ser recusada'; end if;

  -- 3. Fechar com lançamento não conciliado tem de ser recusado.
  insert into public.lancamentos (tipo, descricao, valor, data_vencimento, data_pagamento,
    conta_id, categoria_id, centro_id)
    values ('Receita', '__teste__', 4000.00, date '2026-06-15', date '2026-06-15',
            v_conta, v_cat, v_centro)
    returning id into v_lanc;

  v_ok := false;
  begin
    perform public.fechar_periodo(date '2026-06-01');
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'Fechar mes nao conciliado deveria ser recusado'; end if;

  -- 4. Com tudo conciliado, o mês fecha e o rateio soma exatamente o resultado.
  update public.lancamentos
     set conciliado = true, conciliado_em = now(), conciliado_por = v_lucas
   where id = v_lanc;
  update public.lancamentos
     set conciliado = true, conciliado_em = now(), conciliado_por = v_lucas
   where conta_id = v_conta and not conciliado and situacao = 'Realizada';

  v_fech := public.fechar_periodo(date '2026-06-01');

  if (select resultado from public.fechamentos where id = v_fech) <> 4000.00 then
    raise exception 'Resultado de junho deveria ser 4.000';
  end if;

  select coalesce(sum(valor), 0) into v_soma
    from public.fechamento_socios where fechamento_id = v_fech;
  if v_soma <> 4000.00 then
    raise exception 'A soma das partes dos sócios (%) não fecha com o resultado', v_soma;
  end if;

  -- 5. Sócio sem privilégio não desfaz conciliação de mês fechado.
  perform set_config(
    'request.jwt.claims',
    json_build_object('email', 'ninguem@exemplo.com')::text,
    true
  );

  v_ok := false;
  begin
    update public.lancamentos set conciliado = false where id = v_lanc;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception 'Desfazer conciliação em mês fechado deveria exigir privilégio';
  end if;

  -- 6. O sócio autorizado consegue.
  perform set_config(
    'request.jwt.claims',
    json_build_object('email', (select email from public.socios where pode_desfazer_conciliacao limit 1))::text,
    true
  );
  update public.lancamentos set conciliado = false where id = v_lanc;

  -- Limpeza.
  delete from public.fechamento_socios where fechamento_id = v_fech;
  delete from public.fechamentos where id = v_fech;
  delete from public.aportes where conta_id = v_conta;
  delete from public.lancamentos where conta_id = v_conta;
  delete from public.contas_bancarias where banco = '__teste__';
  delete from public.categorias where nome = '__teste__';
  delete from public.centros_custo where nome = '__teste__';
  delete from public.audit_log
    where dados_depois::text like '%__teste__%' or dados_antes::text like '%__teste__%';

  raise notice 'OK: aporte no saldo, devolucao limitada, fechamento exige conciliacao, rateio fecha.';
end;
$$;
