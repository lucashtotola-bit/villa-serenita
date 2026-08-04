-- =============================================================================
-- Villa Serenità — Etapa 1 (correção): separar "ser sócio" de "usar o sistema"
-- =============================================================================
-- A migração 0001 tratou as duas coisas como uma só, exigindo e-mail de todo
-- sócio. Não corresponde à realidade:
--
--   Sócio   = tem 25% do lucro. São sempre 4, mesmo que nunca abram o app.
--             A prestação de contas depende dos quatro existirem.
--   Usuário = faz login. Hoje, só o Lucas.
--
-- Aqui o e-mail vira opcional e quem entra passa a ser marcado por `pode_entrar`.
-- Também fecha a permissão de visitante que o Supabase concede por padrão.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Fechar o acesso de visitante (não autenticado)
-- -----------------------------------------------------------------------------
-- As linhas já estavam protegidas pela RLS, mas o Supabase concede SELECT ao
-- papel `anon` automaticamente em tabelas novas. Sem isso, a segurança depende
-- de uma camada só — e bastaria uma policy mal escrita no futuro para abrir.

revoke all on public.categorias            from anon;
revoke all on public.centros_custo         from anon;
revoke all on public.hospedes              from anon;
revoke all on public.clientes_fornecedores from anon;
revoke all on public.contas_bancarias      from anon;

-- Vale também para as tabelas das próximas etapas.
alter default privileges in schema public revoke all on tables from anon;

-- -----------------------------------------------------------------------------
-- 2. E-mail opcional + chave de acesso
-- -----------------------------------------------------------------------------

alter table public.socios
  alter column email drop not null;

alter table public.socios
  add column if not exists pode_entrar boolean not null default false;

comment on column public.socios.pode_entrar is
  'Se o sócio faz login no sistema. Ser sócio (cota) não implica ser usuário.';
comment on column public.socios.email is
  'Conta Google usada no login. Nulo enquanto o sócio não for usuário do app.';

-- O check antigo não previa e-mail nulo; explicitando a intenção.
alter table public.socios drop constraint if exists socios_email_valido;
alter table public.socios add constraint socios_email_valido
  check (email is null or (email = lower(email) and email like '%@%'));

-- Não faz sentido poder entrar sem ter e-mail: o login é por conta Google.
alter table public.socios add constraint socios_login_exige_email
  check (not pode_entrar or email is not null);

-- Índice único agora ignora os nulos (vários sócios podem estar sem e-mail).
drop index if exists socios_email_unico;
create unique index socios_email_unico
  on public.socios (email) where email is not null;

-- -----------------------------------------------------------------------------
-- 3. A porta de entrada passa a exigir `pode_entrar`
-- -----------------------------------------------------------------------------
-- Estar na tabela de sócios deixa de ser suficiente para acessar o sistema.

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
      and pode_entrar
  );
$$;

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
    and pode_entrar
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- 4. Os quatro sócios
-- -----------------------------------------------------------------------------
-- Cotas iguais de 25% (regra inviolável). A trava da 0001 confere a soma = 100%
-- no fim da transação, então os quatro entram de uma vez.
--
-- Só o Lucas entra no app por enquanto. Para liberar outro sócio depois:
--   update public.socios
--      set email = 'endereco@exemplo.com', pode_entrar = true
--    where nome_curto = 'Michel';

insert into public.socios (
  nome_completo, nome_curto, email, cota,
  pode_entrar, pode_receber_nf, pode_desfazer_conciliacao
)
values
  ('Lucas Hoffmann Tótola',  'Lucas',    'lucas.htotola@gmail.com', 25.00, true,  true,  true),
  ('Michel Hoffmann Tótola', 'Michel',   null,                      25.00, false, true,  false),
  ('Gilson Tótola',          'Gilson',   null,                      25.00, false, false, false),
  ('Rosimere Hoffmann',      'Rosimere', null,                      25.00, false, false, false)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 5. Conferência
-- -----------------------------------------------------------------------------
-- Roda junto e falha a migração inteira se algo saiu do combinado.

do $$
declare
  v_socios  int;
  v_cotas   numeric(6,2);
  v_entram  int;
  v_nf      int;
begin
  select count(*), coalesce(sum(cota), 0) into v_socios, v_cotas
    from public.socios where ativo;
  select count(*) into v_entram from public.socios where pode_entrar;
  select count(*) into v_nf     from public.socios where pode_receber_nf;

  if v_socios <> 4 then
    raise exception 'Esperados 4 sócios ativos, encontrados %', v_socios;
  end if;
  if v_cotas <> 100 then
    raise exception 'Soma das cotas deveria ser 100%%, está em %%%', v_cotas;
  end if;
  if v_entram <> 1 then
    raise exception 'Esperado 1 sócio com acesso, encontrados %', v_entram;
  end if;
  if v_nf <> 2 then
    raise exception 'NF só pode ser emitida contra 2 sócios, encontrados %', v_nf;
  end if;

  raise notice 'OK: 4 sócios, 100%% de cotas, 1 com acesso, 2 podem receber NF.';
end;
$$;
