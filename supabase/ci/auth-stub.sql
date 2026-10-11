-- supabase gen types typescript による型生成のためだけのスタブ。
--
-- schema.sqlはauth.users / auth.uid() / authenticated/anonロールといった、実際の
-- Supabaseプロジェクトが提供するオブジェクトに依存している。ローカル/CIの
-- 素のPostgresにはこれらが存在しないため、型生成(テーブルの列定義さえ読めれば
-- よく、認可ロジックの検証はしない)に必要な最小限だけをここで用意する。
-- 実際のマイグレーションや本番スキーマには含めない。
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
  -- RLSポリシー(client_errors など)が `to anon` を使う。素のPostgresには無いので用意する。
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
end
$$;
