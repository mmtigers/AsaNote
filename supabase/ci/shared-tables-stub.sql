-- 共通表(groups / group_members / children)のスタブ。型生成のためだけに使う。
--
-- 共通表の定義の正はあさノート側の supabase/schema.sql(docs/SPEC.md §7)。よるノートの schema.sql は
-- これらを外部キー・RLSで参照するため、素のPostgresで schema.sql を適用するにはこの最小定義が要る。
-- 列はあさノートの定義に合わせてあるが、あさノート側が共通表の列を変えたら、ここも追随すること
-- (生成される型の共通表の部分は、このスタブ由来)。本番スキーマには含めない。
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists group_members (
  group_id uuid not null references groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade unique,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists children (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  created_at timestamptz not null default now()
);
