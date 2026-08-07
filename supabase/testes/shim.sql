-- Simulacro mínimo do ambiente Supabase, para as migrações rodarem local.
-- Só o que elas tocam: papéis, o schema auth e o storage.

create role anon nologin;
create role authenticated nologin;

create schema if not exists auth;

-- As claims do token chegam por GUC, exatamente como no PostgREST.
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text
);

alter table storage.objects enable row level security;

grant usage on schema auth, storage to anon, authenticated;
