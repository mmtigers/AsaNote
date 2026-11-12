-- 共通表(groups / group_members / children / liaison_memo_settings / liaison_memos)のスタブ。型生成のためだけに使う。
--
-- 共通表の定義の正はあさノート側の supabase/schema.sql(docs/SPEC.md §7)。よるノートの schema.sql は
-- これらを外部キー・RLSで参照するため、素のPostgresで schema.sql を適用するにはこの最小定義が要る。
-- 列はあさノートの定義に合わせてあるが、あさノート側が共通表の列を変えたら、ここも追随すること
-- (生成される型の共通表の部分は、このスタブ由来)。本番スキーマには含めない。
-- ずれは CI の `npm run check:stub`(scripts/check-shared-stub.mjs)が検出する。
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

-- 連絡メモの下書き(liaison_memo_settings / liaison_memos。apps/yoru/docs/liaison-memo.md)。
-- 定義の正はあさノートの supabase/schema.sql(RLS・トリガー・権限もそちら)。ここは型生成のための列だけ。
-- 既定値の uuid_generate_v4() は、拡張に依存しないよう gen_random_uuid() にしている。
create table if not exists liaison_memo_settings (
  child_id uuid primary key references children(id) on delete cascade,
  enabled boolean not null default false,
  consented_by uuid references auth.users(id) on delete set null,
  consented_at timestamptz,
  weekday smallint not null default 4 check (weekday between 0 and 6),
  hour smallint not null default 13 check (hour between 0 and 23),
  target_chars smallint not null default 80 check (target_chars between 50 and 300 and target_chars % 10 = 0),
  recipient_label text not null default '療育先' check (char_length(recipient_label) between 1 and 20),
  include_memo boolean not null default true,
  style_examples text[] not null default '{}' check (cardinality(style_examples) <= 3),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (not enabled or consented_at is not null)
);

create table if not exists liaison_memos (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references children(id) on delete cascade,
  due_date date not null,
  asa_from date,
  asa_to date,
  yoru_from date,
  yoru_to date,
  status text not null default 'generating' check (status in ('generating', 'generated', 'no_records', 'failed')),
  error text check (error is null or char_length(error) <= 200),
  attempts smallint not null default 0 check (attempts between 0 and 10),
  locked_at timestamptz,
  draft_text text check (draft_text is null or char_length(draft_text) <= 2000),
  edited_text text check (edited_text is null or char_length(edited_text) <= 2000),
  contact_draft_text text check (contact_draft_text is null or char_length(contact_draft_text) <= 500),
  contact_edited_text text check (contact_edited_text is null or char_length(contact_edited_text) <= 500),
  final_text text check (final_text is null or char_length(final_text) <= 2000),
  sent_at timestamptz,
  sent_by uuid references auth.users(id) on delete set null,
  regenerate_count smallint not null default 0 check (regenerate_count between 0 and 3),
  model text check (model is null or char_length(model) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (child_id, due_date),
  check (sent_at is null or final_text is not null)
);
