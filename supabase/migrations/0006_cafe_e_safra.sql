-- =============================================================================
-- Villa Serenità — Módulo 4: café e safra
-- =============================================================================
-- Decisões 11 e 12 de spec/decisoes-modelagem.md:
--   - estoque por tipo de café, com o rendimento do beneficiamento
--   - custos da safra são lançamentos normais com centro "Café", não uma
--     tabela paralela que obrigaria a lançar o mesmo gasto duas vezes
--
-- Beneficiar café segue o mesmo padrão da transferência entre contas: uma
-- SAÍDA de um tipo e uma ENTRADA de outro, ligadas pelo mesmo `conversao_id`.
-- A diferença entre as duas quantidades É o rendimento da lavoura.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- safras
-- -----------------------------------------------------------------------------

create table public.safras (
  id                uuid primary key default gen_random_uuid(),
  ciclo             text          not null,
  area_hectares     numeric(10,2),
  expectativa_sacas numeric(12,3),
  observacao        text,
  ativa             boolean       not null default true,
  criado_em         timestamptz   not null default now(),
  atualizado_em     timestamptz   not null default now(),
  criado_por        uuid          default public.socio_atual_id() references public.socios(id),

  constraint safra_ciclo_preenchido check (length(trim(ciclo)) > 0),
  constraint safra_area_positiva check (area_hectares is null or area_hectares > 0),
  constraint safra_expectativa_positiva
    check (expectativa_sacas is null or expectativa_sacas >= 0)
);

create unique index safra_ciclo_unico on public.safras (lower(ciclo));

comment on column public.safras.ciclo is
  'Identificação do ciclo, no formato "2026/27". O café atravessa o ano-calendário.';

-- -----------------------------------------------------------------------------
-- safra_etapas
-- -----------------------------------------------------------------------------
-- Regra inviolável: estas datas são a FONTE ÚNICA do status mostrado na tela
-- do Café. Nada de datas fixas repetidas em outro lugar.

create table public.safra_etapas (
  id           uuid primary key default gen_random_uuid(),
  safra_id     uuid        not null references public.safras(id) on delete cascade,
  nome         text        not null,
  ordem        int         not null,
  data_inicio  date        not null,
  data_fim     date        not null,
  observacao   text,
  criado_em    timestamptz not null default now(),

  constraint etapa_nome_preenchido check (length(trim(nome)) > 0),
  constraint etapa_periodo_valido check (data_fim >= data_inicio)
);

create unique index etapa_ordem_unica on public.safra_etapas (safra_id, ordem);
create unique index etapa_nome_unico on public.safra_etapas (safra_id, lower(nome));

-- -----------------------------------------------------------------------------
-- cafe_estoque_movimentos
-- -----------------------------------------------------------------------------

create table public.cafe_estoque_movimentos (
  id             uuid primary key default gen_random_uuid(),
  safra_id       uuid           not null references public.safras(id),
  data           date           not null default current_date,
  tipo_movimento text           not null,
  tipo_cafe      text           not null,
  sentido        text           not null,
  sacas          numeric(12,3)  not null,
  /** Liga as duas pontas de um beneficiamento (saída de um tipo, entrada de outro). */
  conversao_id   uuid,
  observacao     text,
  criado_em      timestamptz    not null default now(),
  criado_por     uuid           default public.socio_atual_id() references public.socios(id),

  constraint estoque_tipo_movimento_valido check (
    tipo_movimento in ('Colheita', 'Beneficiamento', 'Venda', 'Perda', 'Ajuste')
  ),
  constraint estoque_tipo_cafe_valido check (
    tipo_cafe in ('Coco', 'Cereja descascado', 'Beneficiado')
  ),
  constraint estoque_sentido_valido check (sentido in ('Entrada', 'Saída')),
  constraint estoque_sacas_positivo check (sacas > 0),
  -- Beneficiamento existe sempre aos pares; os demais movimentos são avulsos.
  constraint estoque_conversao_coerente check (
    (tipo_movimento = 'Beneficiamento') = (conversao_id is not null)
  )
);

create index estoque_safra_tipo on public.cafe_estoque_movimentos (safra_id, tipo_cafe);
create index estoque_conversao on public.cafe_estoque_movimentos (conversao_id);
create index estoque_data on public.cafe_estoque_movimentos (data);

comment on table public.cafe_estoque_movimentos is
  'Cada linha é uma entrada ou saída. O saldo por tipo sai da view estoque_cafe.';

-- -----------------------------------------------------------------------------
-- cafe_vendas
-- -----------------------------------------------------------------------------

create table public.cafe_vendas (
  id            uuid primary key default gen_random_uuid(),
  safra_id      uuid          not null references public.safras(id),
  cliente_id    uuid          not null references public.clientes_fornecedores(id),
  data          date          not null,
  tipo_cafe     text          not null,
  sacas         numeric(12,3) not null,
  preco_saca    numeric(14,2) not null,
  -- Calculado pelo banco: não há como o total divergir da conta.
  valor_total   numeric(14,2) generated always as (round(sacas * preco_saca, 2)) stored,

  categoria_id  uuid          not null references public.categorias(id),
  centro_id     uuid          not null references public.centros_custo(id),
  conta_id      uuid          not null references public.contas_bancarias(id),

  /** Receita gerada automaticamente no financeiro. */
  lancamento_id uuid          references public.lancamentos(id),
  /** Baixa de estoque gerada automaticamente. */
  movimento_id  uuid          references public.cafe_estoque_movimentos(id),

  observacao    text,
  ativo         boolean       not null default true,
  criado_em     timestamptz   not null default now(),
  atualizado_em timestamptz   not null default now(),
  criado_por    uuid          default public.socio_atual_id() references public.socios(id),

  constraint venda_tipo_cafe_valido check (
    tipo_cafe in ('Coco', 'Cereja descascado', 'Beneficiado')
  ),
  constraint venda_sacas_positivo check (sacas > 0),
  constraint venda_preco_positivo check (preco_saca > 0)
);

create index venda_safra on public.cafe_vendas (safra_id);
create index venda_cliente on public.cafe_vendas (cliente_id);

-- -----------------------------------------------------------------------------
-- Estoque não pode ficar negativo
-- -----------------------------------------------------------------------------
-- Vender mais do que se tem é erro de digitação, não uma operação válida.
-- Ajuste é a única porta de saída para acertar divergência de inventário.

create or replace function public.tg_estoque_nao_negativo()
returns trigger
language plpgsql
as $$
declare
  v_saldo numeric(12,3);
begin
  select coalesce(sum(case when sentido = 'Entrada' then sacas else -sacas end), 0)
    into v_saldo
    from public.cafe_estoque_movimentos
   where safra_id = new.safra_id
     and tipo_cafe = new.tipo_cafe;

  if v_saldo < 0 and new.tipo_movimento <> 'Ajuste' then
    raise exception
      'Estoque de % ficaria negativo (% sacas). Confira a quantidade.',
      new.tipo_cafe, trim(trailing '.' from trim(trailing '0' from v_saldo::text));
  end if;

  return null;
end;
$$;

create trigger estoque_nao_negativo
  after insert on public.cafe_estoque_movimentos
  for each row execute function public.tg_estoque_nao_negativo();

-- -----------------------------------------------------------------------------
-- Venda gera receita e baixa o estoque
-- -----------------------------------------------------------------------------

create or replace function public.tg_venda_gera_receita_e_baixa()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cliente text;
  v_lanc    uuid;
  v_mov     uuid;
begin
  select nome into v_cliente from public.clientes_fornecedores where id = new.cliente_id;

  insert into public.lancamentos (
    tipo, situacao, descricao, valor, data_vencimento, data_pagamento,
    conta_id, categoria_id, centro_id, clifor_id, criado_por
  ) values (
    'Receita', 'Prevista',
    -- Sem to_char: o separador de milhar faria "20 sacas" virar "20,000",
    -- que em português se lê como vinte mil. Aqui só se tiram os zeros à direita.
    format('Venda de café — %s sacas (%s) para %s',
           trim(trailing '.' from trim(trailing '0' from new.sacas::text)),
           lower(new.tipo_cafe), v_cliente),
    new.valor_total, new.data, null,
    new.conta_id, new.categoria_id, new.centro_id, new.cliente_id, new.criado_por
  )
  returning id into v_lanc;

  insert into public.cafe_estoque_movimentos (
    safra_id, data, tipo_movimento, tipo_cafe, sentido, sacas, observacao, criado_por
  ) values (
    new.safra_id, new.data, 'Venda', new.tipo_cafe, 'Saída', new.sacas,
    format('Venda para %s', v_cliente), new.criado_por
  )
  returning id into v_mov;

  update public.cafe_vendas
     set lancamento_id = v_lanc, movimento_id = v_mov
   where id = new.id;

  return null;
end;
$$;

create trigger venda_gera_receita_e_baixa
  after insert on public.cafe_vendas
  for each row execute function public.tg_venda_gera_receita_e_baixa();

-- -----------------------------------------------------------------------------
-- Visões
-- -----------------------------------------------------------------------------

create view public.estoque_cafe
with (security_invoker = true) as
select
  m.safra_id,
  s.ciclo,
  m.tipo_cafe,
  sum(case when m.sentido = 'Entrada' then m.sacas else -m.sacas end) as sacas
from public.cafe_estoque_movimentos m
join public.safras s on s.id = m.safra_id
group by m.safra_id, s.ciclo, m.tipo_cafe;

comment on view public.estoque_cafe is
  'Saldo de sacas por safra e tipo de café.';

-- O rendimento é a razão entre o que entrou beneficiado e o que saiu em coco.
create view public.rendimento_beneficiamento
with (security_invoker = true) as
-- safra_id entra no agrupamento em vez de ser agregado: não existe min(uuid)
-- no Postgres, e as duas pontas de uma conversão são sempre da mesma safra.
select
  conversao_id,
  safra_id,
  min(data)                                                         as data,
  max(case when sentido = 'Saída'   then tipo_cafe end)             as tipo_origem,
  max(case when sentido = 'Saída'   then sacas end)                 as sacas_origem,
  max(case when sentido = 'Entrada' then tipo_cafe end)             as tipo_resultado,
  max(case when sentido = 'Entrada' then sacas end)                 as sacas_resultado,
  round(
    100 * max(case when sentido = 'Entrada' then sacas end)
        / nullif(max(case when sentido = 'Saída' then sacas end), 0),
    2
  )                                                                 as rendimento_pct
from public.cafe_estoque_movimentos
where conversao_id is not null
group by conversao_id, safra_id;

comment on view public.rendimento_beneficiamento is
  'Quanto café beneficiado saiu de cada lote processado. É o retorno prático '
  'de controlar o estoque por tipo.';

-- -----------------------------------------------------------------------------
-- Rotina
-- -----------------------------------------------------------------------------

create trigger safras_atualizado_em before update on public.safras
  for each row execute function public.tg_atualizado_em();
create trigger vendas_atualizado_em before update on public.cafe_vendas
  for each row execute function public.tg_atualizado_em();

create trigger safras_audit after insert or update or delete on public.safras
  for each row execute function public.tg_audit();
create trigger etapas_audit after insert or update or delete on public.safra_etapas
  for each row execute function public.tg_audit();
create trigger estoque_audit after insert or update or delete on public.cafe_estoque_movimentos
  for each row execute function public.tg_audit();
create trigger vendas_audit after insert or update or delete on public.cafe_vendas
  for each row execute function public.tg_audit();

-- -----------------------------------------------------------------------------
-- Segurança
-- -----------------------------------------------------------------------------

alter table public.safras                  enable row level security;
alter table public.safra_etapas            enable row level security;
alter table public.cafe_estoque_movimentos enable row level security;
alter table public.cafe_vendas             enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'safras', 'safra_etapas', 'cafe_estoque_movimentos', 'cafe_vendas'
  ]
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

-- Reconfigurar as etapas de uma safra exige remover linhas.
create policy etapas_exclusao on public.safra_etapas
  for delete to authenticated using (public.usuario_autorizado());
grant delete on public.safra_etapas to authenticated;

grant select on public.estoque_cafe               to authenticated;
grant select on public.rendimento_beneficiamento  to authenticated;
revoke all   on public.estoque_cafe               from anon;
revoke all   on public.rendimento_beneficiamento  from anon;

-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------

do $$
declare
  v_conta  uuid;
  v_cat    uuid;
  v_centro uuid;
  v_cli    uuid;
  v_safra  uuid;
  v_conv   uuid := gen_random_uuid();
  v_venda  uuid;
  v_saldo  numeric(12,3);
  v_rend   numeric;
  v_ok     boolean;
begin
  insert into public.contas_bancarias (banco, apelido, tipo, saldo_inicial, data_saldo_inicial)
    values ('__teste__', 'cafe', 'Corrente', 0, date '2020-01-01') returning id into v_conta;
  insert into public.categorias (nome, tipo) values ('__teste__', 'Receita') returning id into v_cat;
  insert into public.centros_custo (nome, tipo) values ('__teste__', 'Receita') returning id into v_centro;
  insert into public.clientes_fornecedores (nome, relacao, documento, contato)
    values ('__teste__', 'Cliente', '55566677788', 'x') returning id into v_cli;
  insert into public.safras (ciclo, area_hectares, expectativa_sacas)
    values ('__teste__', 12.5, 500) returning id into v_safra;

  -- 1. Colheita: 100 sacas de coco entram no estoque.
  insert into public.cafe_estoque_movimentos
    (safra_id, data, tipo_movimento, tipo_cafe, sentido, sacas)
    values (v_safra, date '2026-07-01', 'Colheita', 'Coco', 'Entrada', 100);

  select sacas into v_saldo from public.estoque_cafe
   where safra_id = v_safra and tipo_cafe = 'Coco';
  if v_saldo <> 100 then raise exception 'Estoque de coco deveria ser 100, é %', v_saldo; end if;

  -- 2. Beneficiamento: 100 de coco viram 48 beneficiadas.
  insert into public.cafe_estoque_movimentos
    (safra_id, data, tipo_movimento, tipo_cafe, sentido, sacas, conversao_id) values
    (v_safra, date '2026-08-01', 'Beneficiamento', 'Coco', 'Saída', 100, v_conv),
    (v_safra, date '2026-08-01', 'Beneficiamento', 'Beneficiado', 'Entrada', 48, v_conv);

  select rendimento_pct into v_rend from public.rendimento_beneficiamento
   where conversao_id = v_conv;
  if v_rend <> 48.00 then
    raise exception 'Rendimento deveria ser 48%%, calculou %', v_rend;
  end if;

  -- 3. Beneficiamento sem par (conversao_id nulo) tem de ser recusado.
  v_ok := false;
  begin
    insert into public.cafe_estoque_movimentos
      (safra_id, data, tipo_movimento, tipo_cafe, sentido, sacas)
      values (v_safra, date '2026-08-01', 'Beneficiamento', 'Coco', 'Saída', 1);
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'Beneficiamento sem conversão deveria ser recusado'; end if;

  -- 4. Venda gera receita e baixa o estoque, com total calculado pelo banco.
  insert into public.cafe_vendas
    (safra_id, cliente_id, data, tipo_cafe, sacas, preco_saca, categoria_id, centro_id, conta_id)
    values (v_safra, v_cli, date '2026-09-01', 'Beneficiado', 20, 1250.00, v_cat, v_centro, v_conta)
    returning id into v_venda;

  if (select valor_total from public.cafe_vendas where id = v_venda) <> 25000.00 then
    raise exception 'Total da venda deveria ser 25.000,00';
  end if;
  if not exists (
    select 1 from public.cafe_vendas v
      join public.lancamentos l on l.id = v.lancamento_id
     where v.id = v_venda and l.tipo = 'Receita' and l.valor = 25000.00
  ) then
    raise exception 'Venda deveria gerar a receita correspondente';
  end if;

  select sacas into v_saldo from public.estoque_cafe
   where safra_id = v_safra and tipo_cafe = 'Beneficiado';
  if v_saldo <> 28 then
    raise exception 'Estoque beneficiado deveria cair para 28, está em %', v_saldo;
  end if;

  -- 5. Vender mais do que existe tem de ser recusado.
  v_ok := false;
  begin
    insert into public.cafe_vendas
      (safra_id, cliente_id, data, tipo_cafe, sacas, preco_saca, categoria_id, centro_id, conta_id)
      values (v_safra, v_cli, date '2026-09-02', 'Beneficiado', 999, 1250.00, v_cat, v_centro, v_conta);
  exception when others then v_ok := true;
  end;
  if not v_ok then raise exception 'Venda acima do estoque deveria ter sido recusada'; end if;

  -- Limpeza.
  delete from public.cafe_vendas where safra_id = v_safra;
  delete from public.cafe_estoque_movimentos where safra_id = v_safra;
  delete from public.lancamentos where conta_id = v_conta;
  delete from public.safra_etapas where safra_id = v_safra;
  delete from public.safras where id = v_safra;
  delete from public.clientes_fornecedores where nome = '__teste__';
  delete from public.contas_bancarias where banco = '__teste__';
  delete from public.categorias where nome = '__teste__';
  delete from public.centros_custo where nome = '__teste__';
  delete from public.audit_log
    where dados_depois::text like '%__teste__%' or dados_antes::text like '%__teste__%';

  raise notice 'OK: colheita, beneficiamento com rendimento 48%%, venda baixa estoque e gera receita.';
end;
$$;
