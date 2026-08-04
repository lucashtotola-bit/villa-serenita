-- =============================================================================
-- Villa Serenità — Módulo 1: lançamentos e transferências
-- =============================================================================
-- A tabela central do sistema: dela saem os saldos das contas, o resultado do
-- mês e a prestação de contas. Decisões 1 a 4 de spec/decisoes-modelagem.md.
--
--   - duas datas: vencimento (quando vence) e pagamento (quando o dinheiro moveu)
--   - situação Prevista/Realizada; só Realizada entra no saldo
--   - conciliado vira somente leitura, travado por trigger
--   - transferência = dois lançamentos irmãos criados pelo próprio banco
-- =============================================================================

-- -----------------------------------------------------------------------------
-- transferencias
-- -----------------------------------------------------------------------------
-- Guarda o lado "humano" da operação (uma transferência, não duas linhas).
-- Os dois lançamentos correspondentes são gerados por trigger mais abaixo.

create table public.transferencias (
  id                uuid primary key default gen_random_uuid(),
  data              date          not null,
  valor             numeric(14,2) not null,
  conta_origem_id   uuid          not null references public.contas_bancarias(id),
  conta_destino_id  uuid          not null references public.contas_bancarias(id),
  observacao        text,
  ativo             boolean       not null default true,
  criado_em         timestamptz   not null default now(),
  atualizado_em     timestamptz   not null default now(),
  criado_por        uuid          default public.socio_atual_id() references public.socios(id),

  constraint transf_valor_positivo check (valor > 0),
  constraint transf_contas_diferentes check (conta_origem_id <> conta_destino_id)
);

comment on table public.transferencias is
  'Movimentação de caixa entre contas próprias. Nunca é receita nem despesa e '
  'não entra no rateio de lucro.';

-- -----------------------------------------------------------------------------
-- lancamentos
-- -----------------------------------------------------------------------------

create table public.lancamentos (
  id               uuid primary key default gen_random_uuid(),
  tipo             text          not null,
  situacao         text          not null default 'Realizada',
  descricao        text          not null,
  valor            numeric(14,2) not null,

  -- Vencimento sempre existe; pagamento só quando o dinheiro se moveu.
  data_vencimento  date          not null,
  data_pagamento   date,

  conta_id         uuid          not null references public.contas_bancarias(id),
  categoria_id     uuid          references public.categorias(id),
  centro_id        uuid          references public.centros_custo(id),
  clifor_id        uuid          references public.clientes_fornecedores(id),

  -- Preenchidos só em lançamentos de transferência.
  transferencia_id uuid          references public.transferencias(id) on delete cascade,
  sentido          text,

  conciliado       boolean       not null default false,
  conciliado_em    timestamptz,
  conciliado_por   uuid          references public.socios(id),

  observacao       text,
  ativo            boolean       not null default true,
  criado_em        timestamptz   not null default now(),
  atualizado_em    timestamptz   not null default now(),
  criado_por       uuid          default public.socio_atual_id() references public.socios(id),

  constraint lanc_tipo_valido
    check (tipo in ('Receita', 'Despesa', 'Transferência')),
  constraint lanc_situacao_valida
    check (situacao in ('Prevista', 'Realizada')),
  constraint lanc_valor_positivo check (valor > 0),
  constraint lanc_descricao_preenchida check (length(trim(descricao)) > 0),

  -- Realizada exige data de pagamento; prevista não pode ter.
  constraint lanc_pagamento_coerente check (
    (situacao = 'Realizada' and data_pagamento is not null)
    or (situacao = 'Prevista' and data_pagamento is null)
  ),

  -- Receita e despesa precisam de classificação contábil; transferência não
  -- tem categoria nem centro, justamente por ficar fora do resultado.
  constraint lanc_classificacao_coerente check (
    case when tipo = 'Transferência'
      then categoria_id is null and centro_id is null and clifor_id is null
      else categoria_id is not null and centro_id is not null
    end
  ),

  -- coalesce porque `sentido in (...)` com nulo devolve NULL, e uma CHECK que
  -- resulta em NULL é considerada satisfeita: sem isso, uma transferência sem
  -- sentido passaria pela trava.
  constraint lanc_transferencia_coerente check (
    case when tipo = 'Transferência'
      then transferencia_id is not null
           and coalesce(sentido, '') in ('Saída', 'Entrada')
      else transferencia_id is null and sentido is null
    end
  ),

  -- Não se concilia o que ainda não aconteceu.
  constraint lanc_conciliado_coerente check (
    not conciliado
    or (situacao = 'Realizada'
        and conciliado_em is not null
        and conciliado_por is not null)
  )
);

comment on column public.lancamentos.situacao is
  'Prevista = compromisso futuro (parcela de NF, dívida, reserva confirmada). '
  'Só Realizada entra no saldo da conta.';
comment on column public.lancamentos.sentido is
  'Saída na conta de origem, Entrada na de destino. Só para transferências.';

create index lanc_conta on public.lancamentos (conta_id);
create index lanc_vencimento on public.lancamentos (data_vencimento);
create index lanc_pagamento on public.lancamentos (data_pagamento);
create index lanc_situacao on public.lancamentos (situacao, tipo);
create index lanc_categoria on public.lancamentos (categoria_id);
create index lanc_centro on public.lancamentos (centro_id);
create index lanc_transferencia on public.lancamentos (transferencia_id);
create index lanc_nao_conciliados on public.lancamentos (conta_id) where not conciliado;

-- -----------------------------------------------------------------------------
-- Trigger: transferência gera os dois lançamentos
-- -----------------------------------------------------------------------------
-- Feito no banco para que a aplicação não tenha como esquecer uma das pontas.

create or replace function public.tg_transferencia_gera_lancamentos()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_descricao text;
begin
  v_descricao := coalesce(nullif(trim(new.observacao), ''), 'Transferência entre contas');

  insert into public.lancamentos (
    tipo, situacao, descricao, valor, data_vencimento, data_pagamento,
    conta_id, transferencia_id, sentido, criado_por
  )
  values
    ('Transferência', 'Realizada', v_descricao, new.valor, new.data, new.data,
     new.conta_origem_id, new.id, 'Saída', new.criado_por),
    ('Transferência', 'Realizada', v_descricao, new.valor, new.data, new.data,
     new.conta_destino_id, new.id, 'Entrada', new.criado_por);

  return null;
end;
$$;

create trigger transferencias_gera_lancamentos
  after insert on public.transferencias
  for each row execute function public.tg_transferencia_gera_lancamentos();

-- -----------------------------------------------------------------------------
-- Trigger: lançamento conciliado é somente leitura
-- -----------------------------------------------------------------------------
-- Regra inviolável. Fica no banco, e não na tela, para que nenhuma falha de
-- interface consiga alterar um valor já conferido contra o extrato.

create or replace function public.tg_lancamento_conciliado_travado()
returns trigger
language plpgsql
as $$
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

  -- Está desfazendo a conciliação. A restrição de período fechado (privilégio
  -- exclusivo do Lucas) entra na migração 0008, junto com `fechamentos`.
  return new;
end;
$$;

create trigger lancamentos_conciliado_travado
  before update on public.lancamentos
  for each row execute function public.tg_lancamento_conciliado_travado();

create trigger transferencias_atualizado_em before update on public.transferencias
  for each row execute function public.tg_atualizado_em();
create trigger lancamentos_atualizado_em before update on public.lancamentos
  for each row execute function public.tg_atualizado_em();

create trigger transferencias_audit
  after insert or update or delete on public.transferencias
  for each row execute function public.tg_audit();
create trigger lancamentos_audit
  after insert or update or delete on public.lancamentos
  for each row execute function public.tg_audit();

-- -----------------------------------------------------------------------------
-- Saldo das contas — calculado, nunca digitado
-- -----------------------------------------------------------------------------
-- `saldo_inicial` é o saldo ao FIM do dia `data_saldo_inicial`; por isso contam
-- os lançamentos pagos DEPOIS dessa data.
-- security_invoker: a view respeita a RLS de quem consulta, não a de quem criou.

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
      when l.tipo = 'Receita'      then  l.valor
      when l.tipo = 'Despesa'      then -l.valor
      when l.sentido = 'Entrada'   then  l.valor
      else                              -l.valor
    end
  ), 0)               as saldo_atual,
  coalesce(sum(
    case when l.situacao = 'Prevista' then 0 else 1 end
  ), 0)               as movimentos
from public.contas_bancarias c
left join public.lancamentos l
       on l.conta_id = c.id
      and l.ativo
      and l.situacao = 'Realizada'
      and l.data_pagamento > c.data_saldo_inicial
where c.ativo
group by c.id, c.banco, c.apelido, c.tipo, c.saldo_inicial, c.data_saldo_inicial;

comment on view public.saldos_contas is
  'Saldo atual de cada conta = saldo inicial + lançamentos realizados depois da '
  'data do saldo inicial. Divergência com o extrato indica lançamento faltando.';

-- -----------------------------------------------------------------------------
-- Segurança
-- -----------------------------------------------------------------------------

alter table public.transferencias enable row level security;
alter table public.lancamentos    enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['transferencias', 'lancamentos']
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
  end loop;
end;
$$;

grant select, insert, update on public.transferencias to authenticated;
grant select, insert, update on public.lancamentos    to authenticated;
grant select                 on public.saldos_contas  to authenticated;

revoke all on public.transferencias from anon;
revoke all on public.lancamentos    from anon;
revoke all on public.saldos_contas  from anon;

-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------
-- Testa as travas de verdade com dados descartáveis e desfaz tudo no fim.

do $$
declare
  v_conta_a uuid;
  v_conta_b uuid;
  v_cat     uuid;
  v_centro  uuid;
  v_transf  uuid;
  v_qtd     int;
  v_ok      boolean;
begin
  -- Cenário temporário.
  insert into public.contas_bancarias (banco, apelido, tipo, saldo_inicial, data_saldo_inicial)
    values ('__teste__', 'origem', 'Corrente', 1000.00, date '2020-01-01')
    returning id into v_conta_a;
  insert into public.contas_bancarias (banco, apelido, tipo, saldo_inicial, data_saldo_inicial)
    values ('__teste__', 'destino', 'Corrente', 0.00, date '2020-01-01')
    returning id into v_conta_b;
  insert into public.categorias (nome, tipo)
    values ('__teste__', 'Despesa') returning id into v_cat;
  insert into public.centros_custo (nome, tipo)
    values ('__teste__', 'Despesa') returning id into v_centro;

  -- 1. Transferência tem de gerar exatamente dois lançamentos.
  insert into public.transferencias (data, valor, conta_origem_id, conta_destino_id)
    values (date '2020-06-01', 250.00, v_conta_a, v_conta_b) returning id into v_transf;

  select count(*) into v_qtd from public.lancamentos where transferencia_id = v_transf;
  if v_qtd <> 2 then
    raise exception 'Transferência deveria gerar 2 lançamentos, gerou %', v_qtd;
  end if;

  -- 2. Os saldos das duas contas têm de refletir a transferência.
  if (select saldo_atual from public.saldos_contas where conta_id = v_conta_a) <> 750.00 then
    raise exception 'Saldo da conta de origem não bateu';
  end if;
  if (select saldo_atual from public.saldos_contas where conta_id = v_conta_b) <> 250.00 then
    raise exception 'Saldo da conta de destino não bateu';
  end if;

  -- 3. Despesa sem categoria tem de ser recusada.
  begin
    insert into public.lancamentos (tipo, descricao, valor, data_vencimento, data_pagamento, conta_id)
      values ('Despesa', '__teste__', 10, date '2020-06-01', date '2020-06-01', v_conta_a);
    raise exception 'Despesa sem categoria deveria ter sido recusada';
  exception when check_violation then null;
  end;

  -- 4. Prevista com data de pagamento tem de ser recusada.
  begin
    insert into public.lancamentos (tipo, situacao, descricao, valor, data_vencimento, data_pagamento, conta_id, categoria_id, centro_id)
      values ('Despesa', 'Prevista', '__teste__', 10, date '2020-06-01', date '2020-06-01', v_conta_a, v_cat, v_centro);
    raise exception 'Prevista com data de pagamento deveria ter sido recusada';
  exception when check_violation then null;
  end;

  -- 5. Transferência sem sentido tem de ser recusada (o defeito do coalesce).
  begin
    insert into public.lancamentos (tipo, descricao, valor, data_vencimento, data_pagamento, conta_id, transferencia_id)
      values ('Transferência', '__teste__', 10, date '2020-06-01', date '2020-06-01', v_conta_a, v_transf);
    raise exception 'Transferência sem sentido deveria ter sido recusada';
  exception when check_violation then null;
  end;

  -- 6. Lançamento conciliado não pode ser alterado.
  insert into public.lancamentos (
    tipo, descricao, valor, data_vencimento, data_pagamento, conta_id,
    categoria_id, centro_id, conciliado, conciliado_em, conciliado_por
  )
  values ('Despesa', '__teste__', 10, date '2020-06-01', date '2020-06-01', v_conta_a,
          v_cat, v_centro, true, now(), (select id from public.socios where pode_entrar limit 1));

  v_ok := false;
  begin
    update public.lancamentos set valor = 99 where descricao = '__teste__' and conciliado;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception 'Lançamento conciliado deveria ser somente leitura';
  end if;

  -- Limpeza: só aqui o DELETE é possível, porque este bloco roda como dono.
  delete from public.lancamentos    where conta_id in (v_conta_a, v_conta_b);
  delete from public.transferencias where id = v_transf;
  delete from public.contas_bancarias where banco = '__teste__';
  delete from public.categorias      where nome  = '__teste__';
  delete from public.centros_custo   where nome  = '__teste__';
  delete from public.audit_log       where dados_depois::text like '%__teste__%'
                                         or dados_antes::text  like '%__teste__%';

  raise notice 'OK: transferência gera 2 lançamentos, saldos batem, travas recusam o inválido.';
end;
$$;
