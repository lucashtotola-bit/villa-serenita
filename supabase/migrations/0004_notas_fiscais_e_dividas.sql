-- =============================================================================
-- Villa Serenità — Módulo 2: notas fiscais e contratos de dívida
-- =============================================================================
-- As duas são a mesma ideia: um compromisso que se desdobra em parcelas, e
-- cada parcela vira automaticamente uma despesa PREVISTA no financeiro
-- (decisão 2 de spec/decisoes-modelagem.md).
--
-- Diferença importante entre elas:
--   - Nota fiscal: a soma das parcelas tem de bater EXATAMENTE com o total.
--     É uma compra dividida no tempo, não pode sobrar nem faltar centavo.
--   - Dívida: a soma das parcelas SUPERA o valor contratado, porque inclui
--     juros. O usuário informa o valor da parcela que o banco cobra
--     (decisão 5); o sistema não tenta calcular.
--
-- O anexo obrigatório da nota fiscal é imposto na migração 0009, junto com a
-- tabela `anexos` — é ela que fecha a regra.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- notas_fiscais
-- -----------------------------------------------------------------------------

create table public.notas_fiscais (
  id                     uuid primary key default gen_random_uuid(),
  numero                 text          not null,
  serie                  text,
  data_emissao           date          not null,
  valor_total            numeric(14,2) not null,

  emitente_id            uuid          not null references public.clientes_fornecedores(id),
  destinatario_socio_id  uuid          not null references public.socios(id),

  -- Classificação única, herdada por todas as parcelas (decisão 7).
  categoria_id           uuid          not null references public.categorias(id),
  centro_id              uuid          not null references public.centros_custo(id),
  conta_id               uuid          not null references public.contas_bancarias(id),

  observacao             text,
  ativo                  boolean       not null default true,
  criado_em              timestamptz   not null default now(),
  atualizado_em          timestamptz   not null default now(),
  criado_por             uuid          default public.socio_atual_id() references public.socios(id),

  constraint nf_valor_positivo check (valor_total > 0),
  constraint nf_numero_preenchido check (length(trim(numero)) > 0)
);

create unique index nf_numero_emitente_unico
  on public.notas_fiscais (numero, emitente_id) where ativo;

create index nf_destinatario on public.notas_fiscais (destinatario_socio_id);
create index nf_emissao on public.notas_fiscais (data_emissao);

comment on table public.notas_fiscais is
  'Notas recebidas de fornecedores. O sítio não tem CNPJ, então são emitidas '
  'contra pessoa física — apenas Lucas ou Michel.';
comment on column public.notas_fiscais.conta_id is
  'Conta de onde as parcelas serão pagas. Alimenta as despesas previstas.';

-- Regra inviolável: destinatário só pode ser sócio marcado com pode_receber_nf.
-- É verificação entre tabelas, então precisa de trigger — CHECK não enxerga
-- outra tabela.
create or replace function public.tg_nf_valida_destinatario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome text;
begin
  select nome_curto into v_nome
    from public.socios
   where id = new.destinatario_socio_id
     and pode_receber_nf
     and ativo;

  if v_nome is null then
    raise exception
      'Nota fiscal só pode ser emitida contra sócio autorizado a receber NF.';
  end if;

  return new;
end;
$$;

create trigger nf_valida_destinatario
  before insert or update of destinatario_socio_id on public.notas_fiscais
  for each row execute function public.tg_nf_valida_destinatario();

-- -----------------------------------------------------------------------------
-- nf_parcelas
-- -----------------------------------------------------------------------------

create table public.nf_parcelas (
  id              uuid primary key default gen_random_uuid(),
  nota_fiscal_id  uuid          not null references public.notas_fiscais(id) on delete cascade,
  numero          int           not null,
  vencimento      date          not null,
  valor           numeric(14,2) not null,
  /** Despesa prevista gerada automaticamente para esta parcela. */
  lancamento_id   uuid          references public.lancamentos(id),
  criado_em       timestamptz   not null default now(),

  constraint nf_parc_valor_positivo check (valor > 0),
  constraint nf_parc_numero_positivo check (numero > 0)
);

create unique index nf_parcela_numero_unico
  on public.nf_parcelas (nota_fiscal_id, numero);
create index nf_parcela_lancamento on public.nf_parcelas (lancamento_id);

-- A soma das parcelas tem de fechar com o total da nota.
-- DEFERRABLE: a conferência roda no fim da transação, então dá para gravar a
-- nota e suas parcelas juntas sem estourar na primeira linha.
create or replace function public.tg_nf_soma_parcelas()
returns trigger
language plpgsql
as $$
declare
  v_nf    uuid;
  v_total numeric(14,2);
  v_soma  numeric(14,2);
begin
  v_nf := coalesce(new.nota_fiscal_id, old.nota_fiscal_id);

  select valor_total into v_total from public.notas_fiscais where id = v_nf;
  if v_total is null then
    return null;  -- a própria nota foi removida
  end if;

  select coalesce(sum(valor), 0) into v_soma
    from public.nf_parcelas where nota_fiscal_id = v_nf;

  if v_soma <> v_total then
    raise exception
      'A soma das parcelas (R$ %) não bate com o total da nota (R$ %).',
      to_char(v_soma, 'FM999G999G990D00'), to_char(v_total, 'FM999G999G990D00');
  end if;

  return null;
end;
$$;

create constraint trigger nf_parcelas_somam_o_total
  after insert or update or delete on public.nf_parcelas
  deferrable initially deferred
  for each row execute function public.tg_nf_soma_parcelas();

-- -----------------------------------------------------------------------------
-- contratos_divida
-- -----------------------------------------------------------------------------

create table public.contratos_divida (
  id                  uuid primary key default gen_random_uuid(),
  descricao           text          not null,
  credor_id           uuid          not null references public.clientes_fornecedores(id),
  titular_socio_id    uuid          references public.socios(id),
  valor_contratado    numeric(14,2) not null,
  numero_parcelas     int           not null,
  primeiro_vencimento date          not null,
  periodicidade       text          not null default 'Mensal',
  /** Anotação, não cálculo: quem informa o valor da parcela é o usuário. */
  juros               text,

  categoria_id        uuid          not null references public.categorias(id),
  centro_id           uuid          not null references public.centros_custo(id),
  conta_id            uuid          not null references public.contas_bancarias(id),

  observacao          text,
  ativo               boolean       not null default true,
  criado_em           timestamptz   not null default now(),
  atualizado_em       timestamptz   not null default now(),
  criado_por          uuid          default public.socio_atual_id() references public.socios(id),

  constraint divida_valor_positivo check (valor_contratado > 0),
  constraint divida_parcelas_positivas check (numero_parcelas > 0),
  constraint divida_descricao_preenchida check (length(trim(descricao)) > 0),
  constraint divida_periodicidade_valida check (
    periodicidade in ('Mensal', 'Bimestral', 'Trimestral', 'Semestral', 'Anual')
  )
);

create index divida_credor on public.contratos_divida (credor_id);
create index divida_titular on public.contratos_divida (titular_socio_id);

comment on column public.contratos_divida.juros is
  'Texto livre, apenas informativo. O banco credor pode usar Price, SAC, com '
  'ou sem TR e taxas embutidas — qualquer cálculo nosso divergiria do boleto.';
comment on column public.contratos_divida.valor_contratado is
  'Valor tomado. A soma das parcelas é MAIOR que este número, por causa dos juros.';

create table public.divida_parcelas (
  id            uuid primary key default gen_random_uuid(),
  contrato_id   uuid          not null references public.contratos_divida(id) on delete cascade,
  numero        int           not null,
  vencimento    date          not null,
  valor         numeric(14,2) not null,
  lancamento_id uuid          references public.lancamentos(id),
  criado_em     timestamptz   not null default now(),

  constraint div_parc_valor_positivo check (valor > 0),
  constraint div_parc_numero_positivo check (numero > 0)
);

create unique index divida_parcela_numero_unico
  on public.divida_parcelas (contrato_id, numero);
create index divida_parcela_lancamento on public.divida_parcelas (lancamento_id);

-- -----------------------------------------------------------------------------
-- Parcela vira despesa prevista
-- -----------------------------------------------------------------------------
-- O elo que faltava no protótipo, onde notas fiscais e dívidas viviam em listas
-- separadas do financeiro. Agora nascer uma parcela é nascer um compromisso
-- visível no fluxo de caixa.

create or replace function public.tg_nf_parcela_gera_despesa()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  nf     public.notas_fiscais%rowtype;
  v_lanc uuid;
begin
  select * into nf from public.notas_fiscais where id = new.nota_fiscal_id;

  -- Sem "de N": as parcelas entram uma a uma, então contar aqui daria o total
  -- parcial ("1/1", "2/2"). O total sai de nf_parcelas na hora de exibir.
  insert into public.lancamentos (
    tipo, situacao, descricao, valor, data_vencimento,
    conta_id, categoria_id, centro_id, clifor_id, criado_por
  )
  values (
    'Despesa', 'Prevista',
    format('NF %s — parcela %s', nf.numero, new.numero),
    new.valor, new.vencimento,
    nf.conta_id, nf.categoria_id, nf.centro_id, nf.emitente_id, nf.criado_por
  )
  returning id into v_lanc;

  update public.nf_parcelas set lancamento_id = v_lanc where id = new.id;
  return null;
end;
$$;

create trigger nf_parcela_gera_despesa
  after insert on public.nf_parcelas
  for each row execute function public.tg_nf_parcela_gera_despesa();

create or replace function public.tg_divida_parcela_gera_despesa()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ct     public.contratos_divida%rowtype;
  v_lanc uuid;
begin
  select * into ct from public.contratos_divida where id = new.contrato_id;

  insert into public.lancamentos (
    tipo, situacao, descricao, valor, data_vencimento,
    conta_id, categoria_id, centro_id, clifor_id, criado_por
  )
  values (
    'Despesa', 'Prevista',
    format('%s — parcela %s/%s', ct.descricao, new.numero, ct.numero_parcelas),
    new.valor, new.vencimento,
    ct.conta_id, ct.categoria_id, ct.centro_id, ct.credor_id, ct.criado_por
  )
  returning id into v_lanc;

  update public.divida_parcelas set lancamento_id = v_lanc where id = new.id;
  return null;
end;
$$;

create trigger divida_parcela_gera_despesa
  after insert on public.divida_parcelas
  for each row execute function public.tg_divida_parcela_gera_despesa();

-- -----------------------------------------------------------------------------
-- Rotina
-- -----------------------------------------------------------------------------

create trigger nf_atualizado_em before update on public.notas_fiscais
  for each row execute function public.tg_atualizado_em();
create trigger divida_atualizado_em before update on public.contratos_divida
  for each row execute function public.tg_atualizado_em();

create trigger nf_audit after insert or update or delete on public.notas_fiscais
  for each row execute function public.tg_audit();
create trigger nf_parcelas_audit after insert or update or delete on public.nf_parcelas
  for each row execute function public.tg_audit();
create trigger divida_audit after insert or update or delete on public.contratos_divida
  for each row execute function public.tg_audit();
create trigger divida_parcelas_audit after insert or update or delete on public.divida_parcelas
  for each row execute function public.tg_audit();

-- -----------------------------------------------------------------------------
-- Segurança
-- -----------------------------------------------------------------------------

alter table public.notas_fiscais    enable row level security;
alter table public.nf_parcelas      enable row level security;
alter table public.contratos_divida enable row level security;
alter table public.divida_parcelas  enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'notas_fiscais', 'nf_parcelas', 'contratos_divida', 'divida_parcelas'
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

-- Parcelas podem ser removidas ao reparcelar uma nota antes de gravar; a nota
-- em si nunca é apagada, apenas arquivada.
create policy nf_parcelas_exclusao on public.nf_parcelas
  for delete to authenticated using (public.usuario_autorizado());
create policy divida_parcelas_exclusao on public.divida_parcelas
  for delete to authenticated using (public.usuario_autorizado());

grant delete on public.nf_parcelas     to authenticated;
grant delete on public.divida_parcelas to authenticated;

-- -----------------------------------------------------------------------------
-- Conferência
-- -----------------------------------------------------------------------------

do $$
declare
  v_conta   uuid;
  v_cat     uuid;
  v_centro  uuid;
  v_forn    uuid;
  v_lucas   uuid;
  v_gilson  uuid;
  v_nf      uuid;
  v_ct      uuid;
  v_qtd     int;
  v_soma    numeric(14,2);
  v_ok      boolean;
begin
  select id into v_lucas  from public.socios where pode_receber_nf order by nome_curto limit 1;
  select id into v_gilson from public.socios where not pode_receber_nf limit 1;

  insert into public.contas_bancarias (banco, apelido, tipo, saldo_inicial, data_saldo_inicial)
    values ('__teste__', 'nf', 'Corrente', 0, date '2020-01-01') returning id into v_conta;
  insert into public.categorias (nome, tipo) values ('__teste__', 'Despesa') returning id into v_cat;
  insert into public.centros_custo (nome, tipo) values ('__teste__', 'Despesa') returning id into v_centro;
  insert into public.clientes_fornecedores (nome, relacao, documento, contato)
    values ('__teste__', 'Fornecedor', '11122233344', 'x') returning id into v_forn;

  -- 1. NF contra sócio sem permissão tem de ser recusada.
  v_ok := false;
  begin
    insert into public.notas_fiscais (numero, data_emissao, valor_total, emitente_id,
      destinatario_socio_id, categoria_id, centro_id, conta_id)
    values ('__teste__', date '2026-07-01', 900.00, v_forn, v_gilson, v_cat, v_centro, v_conta);
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception 'NF contra sócio sem pode_receber_nf deveria ter sido recusada';
  end if;

  -- 2. NF válida com 3 parcelas gera 3 despesas previstas.
  insert into public.notas_fiscais (numero, data_emissao, valor_total, emitente_id,
    destinatario_socio_id, categoria_id, centro_id, conta_id)
  values ('__teste__', date '2026-07-01', 900.00, v_forn, v_lucas, v_cat, v_centro, v_conta)
  returning id into v_nf;

  insert into public.nf_parcelas (nota_fiscal_id, numero, vencimento, valor) values
    (v_nf, 1, date '2026-07-01', 300.00),
    (v_nf, 2, date '2026-07-31', 300.00),
    (v_nf, 3, date '2026-08-30', 300.00);

  select count(*) into v_qtd
    from public.nf_parcelas p
    join public.lancamentos l on l.id = p.lancamento_id
   where p.nota_fiscal_id = v_nf
     and l.situacao = 'Prevista'
     and l.tipo = 'Despesa';
  if v_qtd <> 3 then
    raise exception 'NF em 3x deveria gerar 3 despesas previstas, gerou %', v_qtd;
  end if;

  -- 3. Despesa prevista não pode alterar o saldo da conta.
  if (select saldo_atual from public.saldos_contas where conta_id = v_conta) <> 0 then
    raise exception 'Despesa prevista não deveria mexer no saldo';
  end if;

  -- 4. Parcelas que não somam o total têm de ser recusadas.
  -- A trava é diferida (só confere no fim da transação, para permitir gravar
  -- nota e parcelas juntas), então aqui ela é forçada a conferir na hora.
  v_ok := false;
  begin
    insert into public.nf_parcelas (nota_fiscal_id, numero, vencimento, valor)
      values (v_nf, 4, date '2026-09-29', 50.00);
    set constraints public.nf_parcelas_somam_o_total immediate;
  exception when others then v_ok := true;
  end;
  set constraints public.nf_parcelas_somam_o_total deferred;
  if not v_ok then
    raise exception 'Parcela que desequilibra o total deveria ter sido recusada';
  end if;

  -- 5. Dívida: a soma das parcelas PODE superar o contratado (juros).
  insert into public.contratos_divida (descricao, credor_id, titular_socio_id,
    valor_contratado, numero_parcelas, primeiro_vencimento, categoria_id, centro_id, conta_id)
  values ('__teste__', v_forn, v_lucas, 1000.00, 2, date '2026-08-01', v_cat, v_centro, v_conta)
  returning id into v_ct;

  insert into public.divida_parcelas (contrato_id, numero, vencimento, valor) values
    (v_ct, 1, date '2026-08-01', 560.00),
    (v_ct, 2, date '2026-09-01', 560.00);

  select coalesce(sum(valor), 0) into v_soma from public.divida_parcelas where contrato_id = v_ct;
  if v_soma <= 1000.00 then
    raise exception 'A soma das parcelas da dívida deveria superar o contratado';
  end if;

  select count(*) into v_qtd
    from public.divida_parcelas p join public.lancamentos l on l.id = p.lancamento_id
   where p.contrato_id = v_ct and l.situacao = 'Prevista';
  if v_qtd <> 2 then
    raise exception 'Contrato em 2x deveria gerar 2 despesas previstas, gerou %', v_qtd;
  end if;

  -- Limpeza. As parcelas apontam para os lançamentos, então saem primeiro —
  -- na ordem inversa, a integridade referencial recusaria o DELETE.
  delete from public.divida_parcelas where contrato_id = v_ct;
  delete from public.contratos_divida where id = v_ct;
  delete from public.nf_parcelas where nota_fiscal_id = v_nf;
  delete from public.notas_fiscais where id = v_nf;
  delete from public.lancamentos where conta_id = v_conta;
  delete from public.clientes_fornecedores where nome = '__teste__';
  delete from public.contas_bancarias where banco = '__teste__';
  delete from public.categorias where nome = '__teste__';
  delete from public.centros_custo where nome = '__teste__';
  delete from public.audit_log
    where dados_depois::text like '%__teste__%' or dados_antes::text like '%__teste__%';

  raise notice 'OK: NF em 3x gera 3 previstas; soma travada; divida aceita juros.';
end;
$$;
