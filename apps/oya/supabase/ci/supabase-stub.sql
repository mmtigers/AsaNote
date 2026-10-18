-- 素の Postgres で、おやノートの schema.sql を適用・検証するためのスタブ(本番には適用しない)。
--
-- 型生成(_db-types-check.yml)と、権限のテスト(supabase/tests/rls.test.sql)の両方に使う。
-- あさノート・よるノートの auth-stub.sql は auth.uid() が常に null を返す型生成専用のもので、
-- RLS の検証には使えない。ここでは実際の Supabase と同じく、リクエストの JWT の sub
-- (request.jwt.claim.sub / request.jwt.claims)を auth.uid() として返す。
-- テストは `select set_config('request.jwt.claim.sub', '<user id>', true); set local role authenticated;`
-- で、その利用者としてのリクエストを再現する。

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

create or replace function auth.uid() returns uuid
  language sql stable
  as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end
$$;

grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;

-- Supabase は public の表・関数・シーケンスに、anon / authenticated への権限を既定で付ける(守りは RLS)。
-- 同じ前提で検証するため、ここでも既定の権限を付ける(この後に作られる public のオブジェクトが対象)。
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;

-- Storage(写真)。実際の Supabase と同じく、storage.objects には RLS がかかる。
create schema if not exists storage;
grant usage on schema storage to anon, authenticated;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now()
);

alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;

-- 実際の Supabase と同じく、パスのフォルダ部分(最後のファイル名を除く)を返す。
create or replace function storage.foldername(name text) returns text[]
  language plpgsql immutable
  as $$
  declare
    _parts text[];
  begin
    select string_to_array(name, '/') into _parts;
    return _parts[1:array_length(_parts, 1) - 1];
  end
  $$;

grant execute on function storage.foldername(text) to anon, authenticated;
