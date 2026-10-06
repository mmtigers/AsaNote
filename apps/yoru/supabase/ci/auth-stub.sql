-- supabase gen types typescript による型生成のためだけのスタブ(あさノートの supabase/ci/auth-stub.sql と同じ)。
--
-- schema.sql は auth.users / auth.uid() / authenticated ロールといった、実際のSupabaseプロジェクトが
-- 提供するオブジェクトに依存している。素のPostgresにはこれらが無いので、型生成(列定義さえ読めればよく、
-- 認可ロジックの検証はしない)に必要な最小限だけをここで用意する。本番スキーマには含めない。
create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

create or replace function auth.uid() returns uuid
  language sql stable
  as $$ select null::uuid $$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end
$$;

-- RLSポリシーが storage.objects / storage.buckets を参照するため、型生成用に空の表だけ用意する。
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text
);

create or replace function storage.foldername(name text) returns text[]
  language sql immutable
  as $$ select string_to_array(name, '/') $$;
