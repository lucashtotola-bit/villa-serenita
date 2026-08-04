-- =============================================================================
-- Villa Serenità — Módulo 3: reservas e acomodações
-- =============================================================================
-- Decisões 8 a 10 de spec/decisoes-modelagem.md:
--   - pacote com mais de uma casa: o usuário informa o valor de cada uma, e a
--     soma tem de fechar com o total da reserva
--   - reserva confirmada gera receita PREVISTA (sinal + saldo)
--   - cancelamento é status com motivo, não arquivamento
--
-- O banco também impede reservar a mesma casa duas vezes no mesmo período —
-- não por conferência da tela, mas por restrição do próprio Postgres.
-- =============================================================================

-- Necessária para combinar igualdade (acomodação) com sobreposição (período)
-- numa mesma restrição de exclusão.
create extension if not exists btree_gist;

-- -----------------------------------------------------------------------------
-- acomodacoes
-- -----------------------------------------------------------------------------

create table public.acomodacoes (
  id            uuid primary key default gen_random_uuid(),
  nome          text          not null,
  cor           text          not null default '#93a35f',
  capacidade    int,
  diaria_padrao numeric(14,2),
  ordem         int           not null default 0,
  ativo         boolean       not null default true,
  criado_em     timestamptz   not null default now(),
  atualizado_em timestamptz   not null default now(),

  constraint acom_nome_preenchido check (length(trim(nome)) > 0),
  constraint acom_cor_valida check (cor ~ '^#[0-9a-fA-F]{6}$'),
  constraint acom_capacidade_positiva check (capacidade is null or capacidade > 0)
);

create unique index acom_nome_unico on public.acomodacoes (lower(nome)) where ativo;

comment on column public.acomodacoes.cor is
  'Usada para distinguir a acomodação no calendário. No protótipo: Rifugio '
  '#93a35f, Casa Vecchia #d8dcc4, Casa Verona #a9553f.';

-- As três da propriedade. Cores idênticas às do protótipo.
insert into public.acomodacoes (nome, cor, ordem) values
  ('Rifugio Fieline', '#93a35f', 1),
  ('Casa Vecchia',    '#d8dcc4', 2),
  ('Casa Verona',     '#a9553f', 3);

-- -----------------------------------------------------------------------------
-- reservas
-- -----------------------------------------------------------------------------

create table public.reservas (
  id                   uuid primary key default gen_random_uuid(),
  -- Regra inviolável: hóspede é obrigatório e vem sempre do cadastro.
  hospede_id           uuid          not null references public.hospedes(id),
  canal                text          not null,
  data_entrada         date          not null,
  data_saida           date          not null,
  numero_hospedes      int           not null default 1,
  valor_total          numeric(14,2) not null,
  sinal                numeric(14,2) not null default 0,
  status               text          not null default 'Pré-reserva',
  motivo_cancelamento  text,

  -- Classificação da receita gerada. A tela pré-seleciona Hospedagem, mas o
  -- dado fica explícito aqui em vez de ser procurado pelo nome.
  categoria_id         uuid          not null references public.categorias(id),
  centro_id            uuid          not null references public.centros_custo(id),
  conta_id             uuid          not null references public.contas_bancarias(id),

  observacao           text,
  criado_em            timestamptz   not null default now(),
  atualizado_em        timestamptz   not null default now(),
  criado_por           uuid          default public.socio_atual_id() references public.socios(id),

  constraint reserva_canal_valido check (
    canal in ('Airbnb', 'WhatsApp', 'Instagram', 'Indicação', 'Direto')
  ),
  constraint reserva_status_valido check (
    status in ('Pré-reserva', 'Confirmada', 'Concluída', 'Cancelada')
  ),
  constraint reserva_periodo_valido check (data_saida > data_entrada),
  constraint reserva_hospedes_positivo check (numero_hospedes > 0),
  constraint reserva_valor_positivo check (valor_total > 0),
  constraint reserva_sinal_valido check (sinal >= 0 and sinal <= valor_total),
  -- Cancelamento sem motivo vira mistério três meses depois.
  constraint reserva_cancelamento_com_motivo check (
    status <> 'Cancelada' or length(trim(coalesce(motivo_cancelamento, ''))) > 0
  )
);

create index reserva_hospede on public.reservas (hospede_id);
create index reserva_entrada on public.reservas (data_entrada);
create index reserva_status on public.reservas (status);

-- Liga a receita gerada de volta à reserva que a originou.
alter table public.lancamentos
  add column reserva_id uuid references public.reservas(id);
create index lanc_reserva on public.lancamentos (reserva_id);

-- -----------------------------------------------------------------------------
-- reserva_acomodacoes
-- -----------------------------------------------------------------------------
-- Uma reserva pode ocupar mais de uma casa (pacote de grupo ou família).
-- `periodo` e `ativo` são cópias do que está em `reservas`, mantidas por
-- trigger: sem elas aqui, o Postgres não consegue impedir a dupla reserva.

create table public.reserva_acomodacoes (
  id             uuid primary key default gen_random_uuid(),
  reserva_id     uuid          not null references public.reservas(id) on delete cascade,
  acomodacao_id  uuid          not null references public.acomodacoes(id),
  valor          numeric(14,2) not null,
  periodo        daterange     not null,
  ativo          boolean       not null default true,
  criado_em      timestamptz   not null default now(),

  constraint res_acom_valor_positivo check (valor > 0),

  -- Impede reservar a mesma casa em datas que se cruzam. O período é [entrada,
  -- saída): quem sai dia 10 libera o dia 10 para quem chega.
  constraint reserva_sem_sobreposicao exclude using gist (
    acomodacao_id with =,
    periodo with &&
  ) where (ativo)
);

create unique index res_acom_unica
  on public.reserva_acomodacoes (reserva_id, acomodacao_id);
create index res_acom_acomodacao on public.reserva_acomodacoes (acomodacao_id);

comment on constraint reserva_sem_sobreposicao on public.reserva_acomodacoes is
  'Dupla reserva é impossível no banco, não apenas desencorajada pela tela.';

-- Mantém `periodo` e `ativo` alinhados com a reserva.
create or replace function public.tg_res_acom_sincroniza()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.reservas%rowtype;
begin
  select * into r from public.reservas where id = new.reserva_id;
  new.periodo := daterange(r.data_entrada, r.data_saida, '[)');
  new.ativo := (r.status <> 'Cancelada');
  return new;
end;
$$;

create trigger res_acom_sincroniza
  before insert on public.reserva_acomodacoes
  for each row execute function public.tg_res_acom_sincroniza();

-- Mudou data ou status na reserva: as linhas de acomodação acompanham.
create or replace function public.tg_reserva_propaga_periodo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.reserva_acomodacoes
     set periodo = daterange(new.data_entrada, new.data_saida, '[)'),
         ativo   = (new.status <> 'Cancelada')
   where reserva_id = new.id;
  return null;
end;
$$;

create trigger reserva_propaga_periodo
  after update of data_entrada, data_saida, status on public.reservas
  for each row execute function public.tg_reserva_propaga_periodo();

-- A soma das casas tem de fechar com o total da reserva (decisão 8).
create or replace function public.tg_reserva_soma_acomodacoes()
returns trigger
language plpgsql
as $$
declare
  v_reserva uuid;
  v_total   numeric(14,2);
  v_soma    numeric(14,2);
begin
  v_reserva := coalesce(new.reserva_id, old.reserva_id);

  select valor_total into v_total from public.reservas where id = v_reserva;
  if v_total is null then
    return null;
  end if;

  select coalesce(sum(valor), 0) into v_soma
    from public.reserva_acomodacoes where reserva_id = v_reserva;

  if v_soma <> v_total then
    raise exception
      'A divisão entre as acomodações (R$ %) não fecha com o total da reserva (R$ %).',
      to_char(v_soma, 'FM999G999G990D00'), to_char(v_total, 'FM999G999G990D00');
  end if;

  return null;
end;
$$;

create constraint trigger reserva_acomodacoes_somam_o_total
  after insert or update or delete on public.reserva_acomodacoes
  deferrable initially deferred
  for each row execute function public.tg_reserva_soma_acomodacoes();

-- -----------------------------------------------------------------------------
-- Reserva confirmada gera receita prevista
-- -----------------------------------------------------------------------------
-- Sinal e saldo entram separados porque acontecem em momentos diferentes: o
-- sinal na confirmação, o saldo na chegada do hóspede.

create or replace function public.tg_reserva_gera_receita()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hospede    text;
  v_saldo      numeric(14,2);
  v_status_ant text;
begin
  -- OLD não existe em INSERT: referenciar old.status ali aborta a operação.
  v_status_ant := case when tg_op = 'INSERT' then '' else old.status end;

  -- Confirmou agora e ainda não tem receita lançada.
  if new.status = 'Confirmada'
     and v_status_ant <> 'Confirmada'
     and not exists (select 1 from public.lancamentos where reserva_id = new.id)
  then
    select nome into v_hospede from public.hospedes where id = new.hospede_id;
    v_saldo := new.valor_total - new.sinal;

    if new.sinal > 0 then
      insert into public.lancamentos (
        tipo, situacao, descricao, valor, data_vencimento,
        conta_id, categoria_id, centro_id, reserva_id, criado_por
      ) values (
        'Receita', 'Prevista', format('Sinal — reserva de %s', v_hospede),
        new.sinal, current_date,
        new.conta_id, new.categoria_id, new.centro_id, new.id, new.criado_por
      );
    end if;

    if v_saldo > 0 then
      insert into public.lancamentos (
        tipo, situacao, descricao, valor, data_vencimento,
        conta_id, categoria_id, centro_id, reserva_id, criado_por
      ) values (
        'Receita', 'Prevista', format('Hospedagem — %s', v_hospede),
        v_saldo, new.data_entrada,
        new.conta_id, new.categoria_id, new.centro_id, new.id, new.criado_por
      );
    end if;
  end if;

  -- Cancelou: some com o que ainda era só previsão. O que já foi recebido
  -- (sinal retido, por exemplo) permanece — é receita de verdade.
  if new.status = 'Cancelada' and v_status_ant <> 'Cancelada' then
    update public.lancamentos
       set ativo = false
     where reserva_id = new.id
       and situacao = 'Prevista'
       and not conciliado;
  end if;

  return null;
end;
$$;

create trigger reserva_gera_receita
  after insert or update of status on public.reservas
  for each row execute function public.tg_reserva_gera_receita();

-- -----------------------------------------------------------------------------
-- Rotina
-- -----------------------------------------------------------------------------

create trigger acomodacoes_atualizado_em before update on public.acomodacoes
  for each row execute function public.tg_atualizado_em();
create trigger reservas_atualizado_em before update on public.reservas
  for each row execute function public.tg_atualizado_em();

create trigger acomodacoes_audit after insert or update or delete on public.acomodacoes
  for each row execute function public.tg_audit();
create trigger reservas_audit after insert or update or delete on public.reservas
  for each row execute function public.tg_audit();
create trigger res_acom_audit after insert or update or delete on public.reserva_acomodacoes
  for each row execute function public.tg_audit();

-- -----------------------------------------------------------------------------
-- Segurança
-- -----------------------------------------------------------------------------

alter table public.acomodacoes         enable row level security;
alter table public.reservas            enable row level security;
alter table public.reserva_acomodacoes enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['acomodacoes', 'reservas', 'reserva_acomodacoes']
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

-- Redividir um pacote antes de gravar exige remover linhas.
create policy res_acom_exclusao on public.reserva_acomodacoes
  for delete to authenticated using (public.usuario_autorizado());
grant delete on public.reserva_acomodacoes to authenticated;

-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------

do $$
declare
  v_conta   uuid;
  v_cat     uuid;
  v_centro  uuid;
  v_hosp    uuid;
  v_rifugio uuid;
  v_res     uuid;
  v_res2    uuid;
  v_qtd     int;
  v_ok      boolean;
begin
  select id into v_rifugio from public.acomodacoes where nome = 'Rifugio Fieline';

  insert into public.contas_bancarias (banco, apelido, tipo, saldo_inicial, data_saldo_inicial)
    values ('__teste__', 'res', 'Corrente', 0, date '2020-01-01') returning id into v_conta;
  insert into public.categorias (nome, tipo) values ('__teste__', 'Receita') returning id into v_cat;
  insert into public.centros_custo (nome, tipo) values ('__teste__', 'Receita') returning id into v_centro;
  insert into public.hospedes (nome, cpf, contato)
    values ('__teste__', '99988877766', 'x') returning id into v_hosp;

  -- 1. Três acomodações criadas.
  select count(*) into v_qtd from public.acomodacoes where ativo;
  if v_qtd <> 3 then
    raise exception 'Esperadas 3 acomodações, encontradas %', v_qtd;
  end if;

  -- 2. Data de saída anterior à entrada tem de ser recusada.
  v_ok := false;
  begin
    insert into public.reservas (hospede_id, canal, data_entrada, data_saida,
      valor_total, categoria_id, centro_id, conta_id)
    values (v_hosp, 'Airbnb', date '2026-09-10', date '2026-09-05', 100, v_cat, v_centro, v_conta);
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'Período invertido deveria ter sido recusado'; end if;

  -- 3. Reserva confirmada com sinal gera duas receitas previstas.
  insert into public.reservas (hospede_id, canal, data_entrada, data_saida,
    valor_total, sinal, status, categoria_id, centro_id, conta_id)
  values (v_hosp, 'Airbnb', date '2026-09-10', date '2026-09-13', 1500.00, 500.00,
          'Confirmada', v_cat, v_centro, v_conta)
  returning id into v_res;

  insert into public.reserva_acomodacoes (reserva_id, acomodacao_id, valor)
    values (v_res, v_rifugio, 1500.00);

  select count(*) into v_qtd from public.lancamentos
   where reserva_id = v_res and situacao = 'Prevista' and tipo = 'Receita' and ativo;
  if v_qtd <> 2 then
    raise exception 'Reserva com sinal deveria gerar 2 receitas previstas, gerou %', v_qtd;
  end if;

  -- 4. Dupla reserva da mesma casa em datas sobrepostas tem de ser recusada.
  insert into public.reservas (hospede_id, canal, data_entrada, data_saida,
    valor_total, categoria_id, centro_id, conta_id)
  values (v_hosp, 'WhatsApp', date '2026-09-12', date '2026-09-15', 900.00,
          v_cat, v_centro, v_conta)
  returning id into v_res2;

  v_ok := false;
  begin
    insert into public.reserva_acomodacoes (reserva_id, acomodacao_id, valor)
      values (v_res2, v_rifugio, 900.00);
  exception when exclusion_violation then v_ok := true;
  end;
  if not v_ok then
    raise exception 'Dupla reserva da mesma casa deveria ter sido recusada';
  end if;

  -- 5. Cancelar desfaz as receitas previstas.
  update public.reservas
     set status = 'Cancelada', motivo_cancelamento = 'teste'
   where id = v_res;

  select count(*) into v_qtd from public.lancamentos
   where reserva_id = v_res and ativo;
  if v_qtd <> 0 then
    raise exception 'Cancelamento deveria desfazer as previsões, sobraram %', v_qtd;
  end if;

  -- 6. Cancelar sem motivo tem de ser recusado.
  v_ok := false;
  begin
    update public.reservas set status = 'Cancelada', motivo_cancelamento = null
     where id = v_res2;
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'Cancelamento sem motivo deveria ter sido recusado'; end if;

  -- Limpeza.
  delete from public.reserva_acomodacoes where reserva_id in (v_res, v_res2);
  delete from public.lancamentos where reserva_id in (v_res, v_res2);
  delete from public.reservas where id in (v_res, v_res2);
  delete from public.hospedes where nome = '__teste__';
  delete from public.contas_bancarias where banco = '__teste__';
  delete from public.categorias where nome = '__teste__';
  delete from public.centros_custo where nome = '__teste__';
  delete from public.audit_log
    where dados_depois::text like '%__teste__%' or dados_antes::text like '%__teste__%';

  raise notice 'OK: 3 acomodações, dupla reserva bloqueada, sinal+saldo previstos, cancelamento desfaz.';
end;
$$;
