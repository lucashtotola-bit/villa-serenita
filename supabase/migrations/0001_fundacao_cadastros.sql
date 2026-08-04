-- =============================================================================
-- Villa Serenità — Etapa 1: fundação + cadastros
-- =============================================================================
-- Decisões refletidas aqui (alinhadas com o dono em 04/08/2026):
--   1. Saldo das contas é CALCULADO a partir dos lançamentos. A conta guarda
--      apenas o saldo inicial e a data dele.
--   2. Cadastro nunca é apagado — é ARQUIVADO (coluna `ativo`). Não existe
--      policy de DELETE em nenhuma tabela, então o banco recusa exclusões.
--   3. Contas bancárias guardam agência/número para casar o extrato OFX.
--
-- Acesso: a tabela `socios` é, ao mesmo tempo, o cadastro dos sócios e a lista
-- de e-mails autorizados. Quem não está nela não lê nem escreve nada.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- Marca `atualizado_em` a cada UPDATE.
create or replace function public.tg_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- E-mail do usuário logado, tirado do token do Supabase Auth.
create or replace function public.email_do_usuario()
returns text
language sql
stable
as $$
  select lower(nullif(auth.jwt() ->> 'email', ''));
$$;

-- -----------------------------------------------------------------------------
-- socios — cadastro dos 4 e lista de acesso
-- -----------------------------------------------------------------------------

create table public.socios (
  id                        uuid primary key default gen_random_uuid(),
  nome_completo             text        not null,
  nome_curto                text        not null,
  email                     text        not null,
  cota                      numeric(5,2) not null default 25.00,
  pode_receber_nf           boolean     not null default false,
  pode_desfazer_conciliacao boolean     not null default false,
  ativo                     boolean     not null default true,
  criado_em                 timestamptz not null default now(),
  atualizado_em             timestamptz not null default now(),

  constraint socios_cota_valida check (cota > 0 and cota <= 100),
  constraint socios_email_valido check (email = lower(email) and email like '%@%')
);

create unique index socios_email_unico on public.socios (email);

comment on table  public.socios is
  'Os quatro sócios. Também é a lista de acesso: e-mail fora daqui não entra.';
comment on column public.socios.nome_curto is
  'Nome exibido em NF, prestação de contas e seletores.';
comment on column public.socios.pode_receber_nf is
  'Regra inviolável: nota fiscal só pode ser emitida contra Lucas ou Michel.';
comment on column public.socios.pode_desfazer_conciliacao is
  'Regra inviolável: só o Lucas desfaz conciliação de período já fechado.';

-- A soma das cotas dos sócios ativos tem de ser exatamente 100%.
-- Regra inviolável: rateio sempre igual, sem opção alternativa.
create or replace function public.valida_soma_das_cotas()
returns trigger
language plpgsql
as $$
declare
  total numeric(6,2);
begin
  select coalesce(sum(cota), 0) into total from public.socios where ativo;

  -- Tabela vazia é estado válido (antes do seed).
  if total <> 0 and total <> 100 then
    raise exception
      'A soma das cotas dos sócios ativos precisa ser 100%%, mas está em %%%', total;
  end if;

  return null;
end;
$$;

-- DEFERRABLE: a validação roda no fim da transação, então dá para inserir os
-- quatro sócios de uma vez sem estourar no primeiro registro.
create constraint trigger socios_soma_cotas_100
  after insert or update or delete on public.socios
  deferrable initially deferred
  for each row execute function public.valida_soma_das_cotas();

create trigger socios_atualizado_em
  before update on public.socios
  for each row execute function public.tg_atualizado_em();

-- Está logado E consta na lista de sócios ativos?
-- SECURITY DEFINER para conseguir ler `socios` sem cair na própria RLS.
create or replace function public.usuario_autorizado()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.socios
    where email = public.email_do_usuario()
      and ativo
  );
$$;

comment on function public.usuario_autorizado() is
  'Porta de entrada do sistema: só passa quem está em socios com ativo = true.';

-- Id do sócio logado — usado como default de `criado_por`, para a aplicação
-- não precisar lembrar de preencher (e não conseguir mentir sobre a autoria).
create or replace function public.socio_atual_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id
  from public.socios
  where email = public.email_do_usuario()
    and ativo
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- Cadastros
-- -----------------------------------------------------------------------------

create table public.categorias (
  id            uuid primary key default gen_random_uuid(),
  nome          text        not null,
  tipo          text        not null,
  ativo         boolean     not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por    uuid        default public.socio_atual_id() references public.socios(id),

  constraint categorias_tipo_valido check (tipo in ('Despesa', 'Receita')),
  constraint categorias_nome_preenchido check (length(trim(nome)) > 0)
);

-- Nome único entre as ativas: arquivar libera o nome para reuso.
create unique index categorias_nome_unico
  on public.categorias (lower(nome)) where ativo;

create table public.centros_custo (
  id            uuid primary key default gen_random_uuid(),
  nome          text        not null,
  tipo          text        not null,
  observacao    text,
  ativo         boolean     not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por    uuid        default public.socio_atual_id() references public.socios(id),

  constraint centros_tipo_valido
    check (tipo in ('Receita e despesa', 'Receita', 'Despesa')),
  constraint centros_nome_preenchido check (length(trim(nome)) > 0)
);

create unique index centros_nome_unico
  on public.centros_custo (lower(nome)) where ativo;

comment on table public.centros_custo is
  'Centro de custo/receita — substitui o antigo campo "Frente" do protótipo.';

create table public.hospedes (
  id            uuid primary key default gen_random_uuid(),
  nome          text        not null,
  cpf           text        not null,
  contato       text        not null,
  email         text,
  origem        text,
  ativo         boolean     not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por    uuid        default public.socio_atual_id() references public.socios(id),

  -- Guardado só com dígitos; a máscara 000.000.000-00 é da interface.
  constraint hospedes_cpf_valido check (cpf ~ '^[0-9]{11}$'),
  constraint hospedes_nome_preenchido check (length(trim(nome)) > 0),
  constraint hospedes_contato_preenchido check (length(trim(contato)) > 0),
  constraint hospedes_origem_valida
    check (origem is null or origem in ('Airbnb', 'WhatsApp', 'Instagram', 'Indicação'))
);

create unique index hospedes_cpf_unico on public.hospedes (cpf) where ativo;

comment on table public.hospedes is
  'Regra inviolável: hóspedes são usados exclusivamente em reservas.';

create table public.clientes_fornecedores (
  id            uuid primary key default gen_random_uuid(),
  nome          text        not null,
  relacao       text        not null,
  documento     text        not null,
  contato       text        not null,
  observacao    text,
  ativo         boolean     not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por    uuid        default public.socio_atual_id() references public.socios(id),

  constraint clifor_relacao_valida
    check (relacao in ('Cliente', 'Fornecedor', 'Cliente e fornecedor')),
  -- 11 dígitos = CPF, 14 = CNPJ.
  constraint clifor_documento_valido check (documento ~ '^([0-9]{11}|[0-9]{14})$'),
  constraint clifor_nome_preenchido check (length(trim(nome)) > 0),
  constraint clifor_contato_preenchido check (length(trim(contato)) > 0)
);

create unique index clifor_documento_unico
  on public.clientes_fornecedores (documento) where ativo;

comment on table public.clientes_fornecedores is
  'Regra inviolável: fonte de compras, despesas e vendas de café. Nunca hóspedes.';

create table public.contas_bancarias (
  id                     uuid primary key default gen_random_uuid(),
  banco                  text         not null,
  apelido                text         not null,
  tipo                   text         not null,
  agencia                text,
  numero_conta           text,
  saldo_inicial          numeric(14,2) not null default 0,
  data_saldo_inicial     date          not null default current_date,
  ativo                  boolean      not null default true,
  criado_em              timestamptz  not null default now(),
  atualizado_em          timestamptz  not null default now(),
  criado_por             uuid         default public.socio_atual_id() references public.socios(id),

  constraint contas_tipo_valido check (tipo in ('Corrente', 'Poupança', 'Pagamento')),
  constraint contas_banco_preenchido check (length(trim(banco)) > 0),
  constraint contas_apelido_preenchido check (length(trim(apelido)) > 0)
);

create unique index contas_banco_apelido_unico
  on public.contas_bancarias (lower(banco), lower(apelido)) where ativo;

comment on column public.contas_bancarias.saldo_inicial is
  'Informado uma única vez. O saldo atual é CALCULADO: saldo_inicial + lançamentos.';
comment on column public.contas_bancarias.agencia is
  'Usado para reconhecer automaticamente de qual conta é o arquivo OFX importado.';

-- `atualizado_em` em todos os cadastros.
create trigger categorias_atualizado_em before update on public.categorias
  for each row execute function public.tg_atualizado_em();
create trigger centros_atualizado_em before update on public.centros_custo
  for each row execute function public.tg_atualizado_em();
create trigger hospedes_atualizado_em before update on public.hospedes
  for each row execute function public.tg_atualizado_em();
create trigger clifor_atualizado_em before update on public.clientes_fornecedores
  for each row execute function public.tg_atualizado_em();
create trigger contas_atualizado_em before update on public.contas_bancarias
  for each row execute function public.tg_atualizado_em();

-- -----------------------------------------------------------------------------
-- audit_log — histórico de quem fez o quê
-- -----------------------------------------------------------------------------

create table public.audit_log (
  id            bigserial primary key,
  tabela        text        not null,
  registro_id   uuid,
  acao          text        not null,
  usuario_email text,
  usuario_id    uuid,
  dados_antes   jsonb,
  dados_depois  jsonb,
  criado_em     timestamptz not null default now()
);

create index audit_log_tabela_registro on public.audit_log (tabela, registro_id);
create index audit_log_criado_em on public.audit_log (criado_em desc);

comment on table public.audit_log is
  'Toda alteração registrada com data, hora e usuário. Só o banco escreve aqui.';

create or replace function public.tg_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id     uuid;
  v_antes  jsonb;
  v_depois jsonb;
begin
  -- NEW não existe em DELETE e OLD não existe em INSERT: referenciar o campo
  -- errado aborta a operação, então cada caso é tratado separadamente.
  if tg_op = 'DELETE' then
    v_id := old.id; v_antes := to_jsonb(old); v_depois := null;
  elsif tg_op = 'UPDATE' then
    v_id := new.id; v_antes := to_jsonb(old); v_depois := to_jsonb(new);
  else
    v_id := new.id; v_antes := null;         v_depois := to_jsonb(new);
  end if;

  insert into public.audit_log (
    tabela, registro_id, acao, usuario_email, usuario_id, dados_antes, dados_depois
  )
  values (
    tg_table_name, v_id, tg_op,
    public.email_do_usuario(), auth.uid(),
    v_antes, v_depois
  );

  return null;  -- trigger AFTER: o retorno é ignorado
end;
$$;

create trigger socios_audit after insert or update or delete on public.socios
  for each row execute function public.tg_audit();
create trigger categorias_audit after insert or update or delete on public.categorias
  for each row execute function public.tg_audit();
create trigger centros_audit after insert or update or delete on public.centros_custo
  for each row execute function public.tg_audit();
create trigger hospedes_audit after insert or update or delete on public.hospedes
  for each row execute function public.tg_audit();
create trigger clifor_audit after insert or update or delete on public.clientes_fornecedores
  for each row execute function public.tg_audit();
create trigger contas_audit after insert or update or delete on public.contas_bancarias
  for each row execute function public.tg_audit();

-- -----------------------------------------------------------------------------
-- Segurança (RLS)
-- -----------------------------------------------------------------------------
-- Padrão: quem está na lista de sócios ativos lê e escreve os cadastros.
-- Nenhuma tabela tem policy de DELETE — arquivar é a única forma de remover.

alter table public.socios                enable row level security;
alter table public.categorias            enable row level security;
alter table public.centros_custo         enable row level security;
alter table public.hospedes              enable row level security;
alter table public.clientes_fornecedores enable row level security;
alter table public.contas_bancarias      enable row level security;
alter table public.audit_log             enable row level security;

-- socios: todos os sócios enxergam a lista; alterar só pelo servidor.
create policy socios_leitura on public.socios
  for select to authenticated
  using (public.usuario_autorizado());

-- audit_log: leitura para os sócios; escrita só pelos triggers.
create policy audit_leitura on public.audit_log
  for select to authenticated
  using (public.usuario_autorizado());

-- Cadastros: leitura e escrita para sócios autorizados.
do $$
declare
  t text;
begin
  foreach t in array array[
    'categorias', 'centros_custo', 'hospedes', 'clientes_fornecedores', 'contas_bancarias'
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
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------
-- Sem GRANT nenhum para `anon`: visitante não autenticado não enxerga nada.

grant usage on schema public to authenticated;

grant select                         on public.socios                to authenticated;
grant select                         on public.audit_log             to authenticated;
grant select, insert, update         on public.categorias            to authenticated;
grant select, insert, update         on public.centros_custo         to authenticated;
grant select, insert, update         on public.hospedes              to authenticated;
grant select, insert, update         on public.clientes_fornecedores to authenticated;
grant select, insert, update         on public.contas_bancarias      to authenticated;

revoke all on public.socios     from anon;
revoke all on public.audit_log  from anon;
