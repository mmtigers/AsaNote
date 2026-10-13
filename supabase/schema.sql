-- あさノート: records + グループ共有 schema

create extension if not exists "uuid-ossp";

create table if not exists records (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_date date not null,
  struggled boolean,
  outcome text,
  wake_time time,
  wake_tags text[] not null default '{}',
  trigger_tags text[] not null default '{}',
  reason_tags text[] not null default '{}',
  response_tags text[] not null default '{}',
  depart_time time,
  companion text,
  handoff text,
  memo text check (memo is null or char_length(memo) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 既存環境向け: create table if not existsは新規列を追加しないため、
-- 登校を渋ったか(struggled)を後から入れられるようにここで個別に追加する。
-- outcome(スムーズ/行き渋り/お休みの3値)導入後は使われないが、過去データを
-- 保持するため列自体は残す(破壊的なdropは行わない)。
alter table records add column if not exists struggled boolean;

-- 登校の結果。'smooth' | 'reluctant' | 'absent'。
alter table records add column if not exists outcome text;

-- 記録した人自身のその朝の体調(1〜5、5段階)。PMS周期との相関などを見るための
-- 簡易入力で、任意項目(#3-4)。
alter table records add column if not exists condition_scale smallint
  check (condition_scale is null or condition_scale between 1 and 5);

create index if not exists idx_records_user_id on records(user_id);
create index if not exists idx_records_record_date on records(record_date desc);

-- 場所・訪問記録アプリ(Matane)と同型のグループ共有機構。夫婦・家族単位で記録を
-- 共有する単位。1ユーザーは同時に1グループのみ所属可能(group_members.user_idの
-- unique制約で担保。将来3人以上の家族拡張を見越しN人グループとして設計)。
create table if not exists groups (
  id uuid primary key default uuid_generate_v4(),
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

-- 招待コードは発行から24時間で失効・1回限り使用(used_atが入っていたら再利用不可)。
create table if not exists group_invites (
  id uuid primary key default uuid_generate_v4(),
  group_id uuid not null references groups(id) on delete cascade,
  code text not null unique,
  created_by uuid references auth.users(id),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  used_at timestamptz,
  used_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_group_members_group_id on group_members(group_id);
create index if not exists idx_group_invites_group_id on group_invites(group_id);

alter table records enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table group_invites enable row level security;

-- groups: 自グループのメンバーのみ参照可。created_by = 自分も常に参照可としているのは、
-- 作成直後(まだgroup_membersに自分を追加する前)のinsert...select()で作成した行を
-- 読み返せるようにするため(RLSはINSERT ... RETURNINGにもSELECTポリシーを適用するため)。
drop policy if exists "groups are readable by members" on groups;

create policy "groups are readable by members"
  on groups for select
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from group_members gm
      where gm.group_id = groups.id and gm.user_id = auth.uid()
    )
  );

drop policy if exists "groups are insertable by their creator" on groups;

create policy "groups are insertable by their creator"
  on groups for insert
  to authenticated
  with check (created_by = auth.uid());

-- group_members: 自分の所属グループのメンバー一覧を閲覧可能。「同じグループの他
-- メンバーかどうか」の判定にgroup_members自身へのサブクエリを使うと無限再帰になるため、
-- SECURITY DEFINER関数経由の判定に置き換える。
create or replace function is_fellow_group_member(p_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

grant execute on function is_fellow_group_member(uuid) to authenticated;

drop policy if exists "group_members are readable by fellow members" on group_members;

create policy "group_members are readable by fellow members"
  on group_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or is_fellow_group_member(group_members.group_id)
  );

-- 招待コード経由の参加はredeem_group_invite() (SECURITY DEFINER、下記)のみで許可し、
-- 直接のINSERTは「自分が作成したグループに自分自身を追加する」場合のみに限定する。
drop policy if exists "group_members are insertable by the founding creator" on group_members;

create policy "group_members are insertable by the founding creator"
  on group_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from groups g
      where g.id = group_members.group_id and g.created_by = auth.uid()
    )
  );

drop policy if exists "group_members are deletable by themselves" on group_members;

create policy "group_members are deletable by themselves"
  on group_members for delete
  to authenticated
  using (user_id = auth.uid());

-- グループ作成(groups行の追加 + 作成者自身をgroup_membersに追加)を1つのトランザクションで
-- 行うSECURITY DEFINER関数。クライアント側で2回に分けてinsertすると、片方だけ成功した
-- 場合に孤立行が残る詰み状態になるため、アトミックにまとめる。
create or replace function create_group()
returns groups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group groups%rowtype;
begin
  if exists (select 1 from group_members where user_id = auth.uid()) then
    raise exception 'already_in_group';
  end if;

  insert into groups (created_by) values (auth.uid())
  returning * into v_group;

  insert into group_members (group_id, user_id) values (v_group.id, auth.uid());

  return v_group;
end;
$$;

grant execute on function create_group() to authenticated;

drop policy if exists "group_invites are readable by group members" on group_invites;

create policy "group_invites are readable by group members"
  on group_invites for select
  to authenticated
  using (
    exists (
      select 1 from group_members gm
      where gm.group_id = group_invites.group_id and gm.user_id = auth.uid()
    )
  );

drop policy if exists "group_invites are insertable by group members" on group_invites;

create policy "group_invites are insertable by group members"
  on group_invites for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and expires_at <= now() + interval '24 hours' + interval '5 minutes'
    and exists (
      select 1 from group_members gm
      where gm.group_id = group_invites.group_id and gm.user_id = auth.uid()
    )
  );

-- 招待コードの照合・消費(group_membersへの参加行追加 + group_invites.used_at更新)を
-- 1つのトランザクションで行うSECURITY DEFINER関数。
create or replace function redeem_group_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite group_invites%rowtype;
begin
  select * into v_invite
  from group_invites
  where code = p_code
    and used_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'invite_invalid';
  end if;

  if exists (select 1 from group_members where user_id = auth.uid()) then
    raise exception 'already_in_group';
  end if;

  insert into group_members (group_id, user_id) values (v_invite.group_id, auth.uid());

  update group_invites
  set used_at = now(), used_by = auth.uid()
  where id = v_invite.id;

  return v_invite.group_id;
end;
$$;

grant execute on function redeem_group_invite(text) to authenticated;

-- グループメンバー一覧画面用。auth.usersのemailはクライアントから直接参照できないため、
-- 自分の所属グループのメンバーに限定してemailを返すSECURITY DEFINER関数を用意する。
create or replace function get_group_members()
returns table (user_id uuid, email text, joined_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select gm.user_id, u.email::text, gm.joined_at
  from group_members gm
  join auth.users u on u.id = gm.user_id
  where gm.group_id = (
    select group_id from group_members where user_id = auth.uid()
  )
  order by gm.joined_at asc;
$$;

grant execute on function get_group_members() to authenticated;

-- 空グループと、期限切れで未使用の招待コードの掃除(Issue #128)。
-- 最後のメンバーが脱退しても groups 行と有効期限内の招待コードが残るため、定期的に消す。
--
-- 消してよい根拠(外部キーを全て確認済み):
--   groups(id) を参照する外部キーは group_members.group_id と group_invites.group_id の
--   2つだけで、どちらも on delete cascade。records / children / notification_settings /
--   push_subscriptions などには group_id 列が無く、グループ削除で記録・子ども・通知設定が
--   消えたり孤立したりすることはない(children は created_by、records は user_id で所有される)。
--   空グループ(group_members が0行)を消して連鎖して消えるのは、そのグループの group_invites だけ。
--
-- 使用済みの招待コード(used_at あり)の履歴は、グループが残る限り消さない。
-- 実行できるのは service_role / pg_cron(postgres)のみ。匿名・一般ユーザーには公開しない。
create or replace function cleanup_empty_groups_and_invites()
returns table (deleted_invites integer, deleted_groups integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invites integer;
  v_groups integer;
begin
  -- 先に期限切れ・未使用の招待コードを消す(使用済みは残す)。
  delete from group_invites
  where used_at is null
    and expires_at < now();
  get diagnostics v_invites = row_count;

  -- メンバーが1人もいないグループだけを消す。メンバーがいるグループには触れない。
  -- create_group() は groups と group_members を同一トランザクションで追加するため、
  -- 作成直後の途中状態(メンバー0人)を、ここから見ることはない。
  delete from groups g
  where not exists (
    select 1 from group_members gm where gm.group_id = g.id
  );
  get diagnostics v_groups = row_count;

  return query select v_invites, v_groups;
end;
$$;

-- Supabase は新しい関数に anon / authenticated / service_role への実行権を自動で付けるため、
-- public からの revoke だけでは足りず、明示的に外す。ロールが無い環境(CI の素のPostgres)でも
-- 失敗しないよう、存在するロールだけを対象にする。
revoke all on function cleanup_empty_groups_and_invites() from public;

do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on function cleanup_empty_groups_and_invites() from %I', v_role);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function cleanup_empty_groups_and_invites() to service_role;
  end if;
end
$$;

-- 複数の子どもがいる家庭向け。groups同様「作成者 + 同じグループのメンバー」が
-- 閲覧できる共有リストとして扱う(id はrecords.child_idから参照する)。
create table if not exists children (
  id uuid primary key default uuid_generate_v4(),
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  created_at timestamptz not null default now()
);

create index if not exists idx_children_created_by on children(created_by);

-- 子どもの作成者がグループを脱退したとき、その子どもの所有(created_by)を、同じグループに
-- 残る別のメンバーへ移す(Issue #128)。移さないと、children の SELECT が「作成者 または 作成者と
-- 同じグループのメンバー」のため、残ったメンバーから子どもが見えなくなり、編集・削除もできなくなる。
--
-- 移す先: そのグループで最も早く参加したメンバー(joined_at が最も古い人。同時刻は user_id 順)。
-- 脱退する本人は除く。
-- 何もしない場合: 残るメンバーがいない(最後の1人の脱退)/ 脱退する人が子どもを作っていない。
--   グループに属さない人の子どもには、この関数は触れない(group_members の行の削除が起点のため)。
-- 脱退の経路(クライアントの直接 delete / アカウント削除による連鎖 / SQL)を問わず動くよう、
-- group_members の before delete トリガーにしている(クライアントの変更は不要)。
-- 同じグループの複数人が同時に脱退しても、互いに「脱退する人」へ移し合わないよう、groups の行を
-- ロックして順番に処理する(for no key update は招待・参加の外部キー確認とは衝突しない)。
-- 関連する外部キー: children.created_by は auth.users(id) への on delete cascade(not null)。
-- records.child_id は on delete set null。この関数は created_by を更新するだけで、children の行は
-- 消さないため、records.child_id には影響しない。
create or replace function transfer_children_on_group_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_owner uuid;
begin
  perform 1 from groups where id = old.group_id for no key update;

  select gm.user_id into v_new_owner
  from group_members gm
  where gm.group_id = old.group_id
    and gm.user_id <> old.user_id
  order by gm.joined_at asc, gm.user_id asc
  limit 1;

  if v_new_owner is null then
    return old;
  end if;

  update children
  set created_by = v_new_owner
  where created_by = old.user_id;

  return old;
end;
$$;

-- トリガー専用の関数。anon / authenticated などから直接呼べる状態にしない。
-- ロールが無い環境(CI の素のPostgres)でも失敗しないよう、存在するロールだけを対象にする。
revoke all on function transfer_children_on_group_leave() from public;

do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on function transfer_children_on_group_leave() from %I', v_role);
    end if;
  end loop;
end
$$;

drop trigger if exists trg_transfer_children_on_group_leave on group_members;

create trigger trg_transfer_children_on_group_leave
  before delete on group_members
  for each row
  execute function transfer_children_on_group_leave();

-- 子どもが1人だけ(childrenが0〜1件)の家庭では入力を増やさないため、
-- 記録フォーム側からは常にnullのまま保存する。子どもを削除した場合も記録自体は
-- 残したいため、on delete set nullで「未分類」に戻す(記録を巻き込んで消さない)。
alter table records add column if not exists child_id uuid references children(id) on delete set null;

alter table children enable row level security;

drop policy if exists "children are readable by creator or group members" on children;

create policy "children are readable by creator or group members"
  on children for select
  to authenticated
  using (
    auth.uid() = created_by
    or exists (
      select 1
      from group_members gm_self
      join group_members gm_owner on gm_owner.group_id = gm_self.group_id
      where gm_self.user_id = auth.uid()
        and gm_owner.user_id = children.created_by
    )
  );

drop policy if exists "children are insertable by creator" on children;

create policy "children are insertable by creator"
  on children for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "children are updatable by creator" on children;

create policy "children are updatable by creator"
  on children for update
  to authenticated
  using (created_by = auth.uid());

drop policy if exists "children are deletable by creator" on children;

create policy "children are deletable by creator"
  on children for delete
  to authenticated
  using (created_by = auth.uid());

-- records: 本人 + 同じグループのメンバーの記録を閲覧可能。編集・削除は本人のみ
-- (パートナーの記録はタイムラインで「表示のみ」になる)。
drop policy if exists "records are readable by owner or group members" on records;
drop policy if exists "records are insertable by owner" on records;
drop policy if exists "records are updatable by owner" on records;
drop policy if exists "records are deletable by owner" on records;

create policy "records are readable by owner or group members"
  on records for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from group_members gm_self
      join group_members gm_owner on gm_owner.group_id = gm_self.group_id
      where gm_self.user_id = auth.uid()
        and gm_owner.user_id = records.user_id
    )
  );

create policy "records are insertable by owner"
  on records for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "records are updatable by owner"
  on records for update
  to authenticated
  using (auth.uid() = user_id);

create policy "records are deletable by owner"
  on records for delete
  to authenticated
  using (auth.uid() = user_id);

-- 未入力日のリマインドPush通知(#3-2)。本体の送信は Edge Function
-- (supabase/functions/send-reminders)がservice roleで行うため、以下のRLSは
-- クライアント(記録した本人)が自分の購読・設定を読み書きする用途のみを想定する。

-- Push通知の購読情報。1ユーザーが複数端末を持ちうるため、endpointごとに複数行を許容する
-- (同じendpointでの再購読はupsertで更新)。
create table if not exists push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user_id on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

drop policy if exists "push_subscriptions are readable by owner" on push_subscriptions;
drop policy if exists "push_subscriptions are insertable by owner" on push_subscriptions;
drop policy if exists "push_subscriptions are updatable by owner" on push_subscriptions;
drop policy if exists "push_subscriptions are deletable by owner" on push_subscriptions;

create policy "push_subscriptions are readable by owner"
  on push_subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "push_subscriptions are insertable by owner"
  on push_subscriptions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "push_subscriptions are updatable by owner"
  on push_subscriptions for update
  to authenticated
  using (auth.uid() = user_id);

create policy "push_subscriptions are deletable by owner"
  on push_subscriptions for delete
  to authenticated
  using (auth.uid() = user_id);

-- 通知設定。ユーザー1人につき1行(reminder_timeの既定値21:00は#3-2の要件どおり)。
create table if not exists notification_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reminder_time time not null default '21:00',
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- パートナーがきろくを新規に記入したときのPush通知(#3-2の拡張)を受け取るか。
-- リマインド(enabled)とは別のON/OFFで、既定はOFF(通知許可を求める操作を伴うため、
-- 本人が明示的にONにするまで送らない)。
alter table notification_settings add column if not exists notify_partner_record boolean not null default false;

alter table notification_settings enable row level security;

drop policy if exists "notification_settings are readable by owner" on notification_settings;
drop policy if exists "notification_settings are insertable by owner" on notification_settings;
drop policy if exists "notification_settings are updatable by owner" on notification_settings;
drop policy if exists "notification_settings are deletable by owner" on notification_settings;

create policy "notification_settings are readable by owner"
  on notification_settings for select
  to authenticated
  using (auth.uid() = user_id);

create policy "notification_settings are insertable by owner"
  on notification_settings for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "notification_settings are updatable by owner"
  on notification_settings for update
  to authenticated
  using (auth.uid() = user_id);

create policy "notification_settings are deletable by owner"
  on notification_settings for delete
  to authenticated
  using (auth.uid() = user_id);

-- 未入力日のリマインドPushの送信済み記録(#130)。send-reminders は設定時刻を過ぎて直近N分以内の
-- ユーザーを対象にする(cron/関数の1分の欠けを取り戻す)ため、同じ日に二重送信しないよう、
-- 「ユーザー × JSTの日付」ごとに1行を残す。主キーの衝突で、同時実行された関数同士も二重に送らない。
-- Edge Function(service role)だけが読み書きする。RLSを有効にしてポリシーを一切作らず、
-- authenticated / anon からは読めも書けもしない(analytics_eventsの集計ビューと同じ「サーバー専用」の扱い)。
create table if not exists reminder_deliveries (
  user_id uuid not null references auth.users(id) on delete cascade,
  sent_on date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, sent_on)
);

alter table reminder_deliveries enable row level security;

-- Supabase は新しいテーブルに anon / authenticated への権限を自動で付けるため、明示的に外す。
-- ロールが無い環境(CI の素のPostgres)でも失敗しないよう、存在するロールだけを対象にする。
revoke all on table reminder_deliveries from public;

do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on table reminder_deliveries from %I', v_role);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, delete on table reminder_deliveries to service_role;
  end if;
end
$$;

-- 記録フローの計測イベント(所要時間・離脱率の分析用)。書き込み専用ログとして扱い、
-- クライアントからの読み取りは許可しない(集計はダッシュボード等からservice role/
-- ダッシュボードSQLで行う想定)。ログイン前(オフライン専用利用)は同期先が無いため、
-- クライアント側(src/lib/analytics.ts)はそもそも送信しない。
create table if not exists analytics_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id uuid,
  event_name text not null,
  properties jsonb not null default '{}',
  client_ts timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_analytics_events_user_id on analytics_events(user_id);
create index if not exists idx_analytics_events_record_id on analytics_events(record_id);

alter table analytics_events enable row level security;

drop policy if exists "analytics_events are insertable by their own user" on analytics_events;

create policy "analytics_events are insertable by their own user"
  on analytics_events for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ブラウザ側で起きた想定外のエラーの記録(後から原因を追うための書き込み専用ログ)。
-- console.error はユーザーの端末に残るだけで開発者には届かないため、error.tsx / window の
-- error・unhandledrejection で捕まえたものを、パッケージ共通の reportClientError()
-- (packages/core/src/clientErrors.ts)がここへ送る。あさノート・よるノートで共用する。
-- ログイン前や認証切れでも原因を残したいので anon からの insert も許可する(user_id は null)。
-- analytics_events と同じく読み取りは許可せず、確認はダッシュボードのSQL Editor/service
-- roleから行う。巨大な値で表を膨らませられないよう、長さはcheck制約で縛る。
create table if not exists client_errors (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  app text not null check (app in ('asa', 'yoru')),
  source text not null,
  message text not null check (char_length(message) <= 1000),
  stack text check (char_length(stack) <= 8000),
  path text check (char_length(path) <= 500),
  user_agent text check (char_length(user_agent) <= 500),
  app_version text check (char_length(app_version) <= 50),
  client_ts timestamptz not null,
  created_at timestamptz not null default now()
);

-- 後から足した列と制約(create table if not exists は既存テーブルを変えないため、ここで冪等に足す)。
-- source: 捕まえたエラーに加え、握りつぶされる同期失敗(sync-failure)と端末DB不可(local-db)も記録する。
-- context: 調査用の付帯情報(オンライン状態・同期待ち件数など)。記録の内容は入れない。
alter table client_errors add column if not exists context jsonb;
alter table client_errors drop constraint if exists client_errors_context_check;
alter table client_errors add constraint client_errors_context_check
  check (char_length(context::text) <= 2000);
alter table client_errors drop constraint if exists client_errors_source_check;
alter table client_errors add constraint client_errors_source_check
  check (source in ('error-boundary', 'window-error', 'unhandled-rejection', 'sync-failure', 'local-db'));

create index if not exists idx_client_errors_created_at on client_errors(created_at desc);

alter table client_errors enable row level security;

drop policy if exists "client_errors are insertable by anyone for themselves" on client_errors;

create policy "client_errors are insertable by anyone for themselves"
  on client_errors for insert
  to anon, authenticated
  with check (user_id is null or auth.uid() = user_id);

-- 匿名(anon)からの insert は anon キーが公開値のため、第三者が REST で連投できる。1行の大きさは上の
-- check 制約で縛っているが、件数は縛れていなかったため、総行数の上限を設ける(#216)。上限に達すると
-- insert は失敗する(クライアントは fire-and-forget のため、画面には影響しない)。古い行は
-- cleanup_old_logs()(下)が定期的に消すので、通常は上限に達しない。上限=20,000行(1行は最大でも約10KBで、
-- 実際はほぼ1KB前後)。RLS で anon は client_errors を読めないため、件数は security definer で数える。
create or replace function client_errors_enforce_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from client_errors) >= 20000 then
    raise exception 'client_errors is full (cap: 20000 rows)' using errcode = '54000';
  end if;
  return new;
end;
$$;

drop trigger if exists client_errors_enforce_cap on client_errors;
create trigger client_errors_enforce_cap
  before insert on client_errors
  for each row execute function client_errors_enforce_cap();

-- 古いログの掃除(#199・#216)。保管期間: client_errors は 90 日、reminder_deliveries は 7 日
-- (send-reminders が使うのは当日の行だけで、残りは調査用)。analytics_events は計測データの扱いが
-- 未決定のため、自動では消さない。cleanup_empty_groups_and_invites() と同じ方式で、実行できるのは
-- service_role と pg_cron(postgres)だけ。定期実行の登録(supabase/cron-cleanup-logs.sql)は手動。
create or replace function cleanup_old_logs()
returns table (deleted_client_errors integer, deleted_reminder_deliveries integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_errors integer;
  v_deliveries integer;
begin
  delete from client_errors
  where created_at < now() - interval '90 days';
  get diagnostics v_errors = row_count;

  delete from reminder_deliveries
  where sent_on < (now() at time zone 'Asia/Tokyo')::date - 7;
  get diagnostics v_deliveries = row_count;

  return query select v_errors, v_deliveries;
end;
$$;
revoke all on function cleanup_old_logs() from public;

-- client_errors の確認用ビュー(直近7日を、画面・種類・文言ごとに集計)。analytics_* ビューと同じく
-- anon / authenticated へは grant しない(ダッシュボードの SQL Editor / service role 専用)。
create or replace view client_errors_summary_7d as
select
  app,
  source,
  message,
  count(*) as occurrences,
  min(created_at) as first_seen,
  max(created_at) as last_seen
from client_errors
where created_at >= now() - interval '7 days'
group by app, source, message
order by occurrences desc, last_seen desc;

do $$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on function cleanup_old_logs() from %I', v_role);
      execute format('revoke all on table client_errors_summary_7d from %I', v_role);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function cleanup_old_logs() to service_role;
  end if;
end
$$;

-- 以下、analytics_eventsの集計用ビュー。analytics_events自体がSELECTを一切許可しない
-- 書き込み専用ログである(#計測)のと同じ理由で、これらのビューもauthenticated/anon
-- へは意図的にgrantしない。ビューはマイグレーション実行ロール(RLSをバイパスする)の
-- 所有物になるため、Supabase ダッシュボードのSQL Editor/service role接続からの
-- 分析専用とする。
-- 注意: Supabase は新しいテーブル・ビューに anon / authenticated への権限を自動で付ける
-- (default privileges)。「grantしない」だけでは公開されてしまうため、ファイル末尾で
-- 明示的に revoke している。ビューを足したら、そこへ必ず追加すること。

-- analytics_eventsをrecord_id(=記録1件)×セッション単位に再構成したもの。
-- record_flow_started/record_flow_resumedをセッションの開始、
-- record_saved/record_flow_pausedを終了とみなす(src/lib/analytics.tsのtrack呼び出し
-- 箇所と対応)。他のビューはすべてこれを土台にする。
create or replace view analytics_record_flow_sessions as
with tagged_events as (
  select
    ae.*,
    sum(
      case when event_name in ('record_flow_started', 'record_flow_resumed') then 1 else 0 end
    ) over (partition by record_id order by client_ts, id) as session_seq
  from analytics_events ae
  where record_id is not null
)
select
  record_id,
  user_id,
  session_seq,
  min(client_ts) filter (where event_name in ('record_flow_started', 'record_flow_resumed')) as started_at,
  max(client_ts) filter (where event_name in ('record_saved', 'record_flow_paused')) as ended_at,
  bool_or(event_name = 'record_flow_resumed') as is_resume,
  -- 旧名 'push_reminder'(実際はアプリ内リマインド経由)は 'in_app_reminder' として読み替える
  -- (analytics_eventsの元データは書き換えない。列の型はtext・位置は変えない)。
  case max(properties ->> 'entry_point') filter (where event_name = 'record_flow_started')
    when 'push_reminder' then 'in_app_reminder'
    else max(properties ->> 'entry_point') filter (where event_name = 'record_flow_started')
  end as entry_point,
  coalesce(
    max(properties ->> 'is_edit') filter (where event_name = 'record_flow_started'),
    max(properties ->> 'is_edit') filter (where event_name = 'record_saved')
  )::boolean as is_edit,
  max((properties ->> 'date_offset_days')::int) filter (where event_name = 'record_flow_started') as date_offset_days,
  bool_or(event_name = 'record_saved') as saved,
  bool_or(event_name = 'record_flow_paused') as paused,
  max(properties ->> 'reason') filter (where event_name = 'record_flow_paused') as pause_reason,
  count(*) filter (where event_name = 'record_step_viewed') as step_view_count,
  extract(epoch from (
    max(client_ts) filter (where event_name in ('record_saved', 'record_flow_paused'))
    - min(client_ts) filter (where event_name in ('record_flow_started', 'record_flow_resumed'))
  )) as duration_seconds
from tagged_events
group by record_id, user_id, session_seq;

-- 「サッと記録できているか」の主指標。新規記録(is_edit=false)かつ中断なしで完走した
-- セッションの所要時間(秒)を、日別・入り口(entry_point)別に集計する。
create or replace view analytics_flow_duration_daily as
select
  (started_at at time zone 'Asia/Tokyo')::date as day,
  entry_point,
  count(*) as saved_count,
  round(avg(duration_seconds)) as avg_duration_seconds,
  round(percentile_cont(0.5) within group (order by duration_seconds)) as median_duration_seconds,
  round(percentile_cont(0.9) within group (order by duration_seconds)) as p90_duration_seconds
from analytics_record_flow_sessions
where saved and not paused and not is_resume and is_edit is not true
group by day, entry_point
order by day, entry_point;

-- 記録フローの各ステップ到達数の日別集計(離脱率の算出用)。
-- 現行アプリの記録フローは1画面で、record_step_viewedは step = 'form' しか送らない。
-- reached_result / reached_reason は旧フロー(複数画面)の過去データ用に残している
-- (新しいデータでは常に0)。現行の到達数は reached_form を見ること。
-- create or replace view は列の追加だけ許すため、新しい列は末尾に足している。
create or replace view analytics_step_funnel_daily as
select
  (client_ts at time zone 'Asia/Tokyo')::date as day,
  count(*) filter (where event_name = 'record_flow_started') as flow_started,
  count(*) filter (where event_name = 'record_step_viewed' and properties ->> 'step' = 'result') as reached_result,
  count(*) filter (where event_name = 'record_outcome_selected') as outcome_selected,
  count(*) filter (where event_name = 'record_step_viewed' and properties ->> 'step' = 'reason') as reached_reason,
  count(*) filter (where event_name = 'record_saved') as saved,
  count(*) filter (where event_name = 'record_flow_paused') as paused,
  count(*) filter (where event_name = 'record_step_viewed' and properties ->> 'step' = 'form') as reached_form
from analytics_events
group by day
order by day;

-- 離脱(record_flow_paused、戻る/下部ナビでのリセット)の理由別件数と、そのうち
-- record_flow_resumedを伴ったセッションの件数を日別に集計する。戻る/リセットの時点で
-- 下書きも消える仕様(useDraftPersistence)のため、この経路での離脱はほぼ再開されない
-- (resumed_countは通常0に近い想定)。record_flow_resumedはアプリ/タブを閉じて離れた
-- ケース(record_flow_pausedでは検知していない)に対応するため、両者は本来ペアではない。
create or replace view analytics_pause_resume_daily as
select
  (s.started_at at time zone 'Asia/Tokyo')::date as day,
  s.pause_reason,
  count(*) as paused_count,
  count(*) filter (
    where exists (
      select 1
      from analytics_record_flow_sessions later
      where later.record_id = s.record_id
        and later.session_seq > s.session_seq
        and later.is_resume
    )
  ) as resumed_count
from analytics_record_flow_sessions s
where s.paused
group by day, s.pause_reason
order by day, s.pause_reason;

-- 上の analytics_* ビューは anon / authenticated から読めてはならない(user_id・操作時刻を含み、
-- ビューは RLS をバイパスするため、権限が残っていると anon キーだけで全ユーザー分が読める)。
-- ビューの作成後に実行する必要があるので、ファイル末尾に置く。create or replace view は権限を
-- 保つため、毎回の適用後に再度 revoke してよい(冪等)。
-- ロールが無い環境(CI の素のPostgres)でも失敗しないよう、存在するロールだけを対象にする。
do $$
declare
  v_role text;
  v_view text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      foreach v_view in array array[
        'analytics_record_flow_sessions',
        'analytics_flow_duration_daily',
        'analytics_step_funnel_daily',
        'analytics_pause_resume_daily'
      ] loop
        execute format('revoke all on table %I from %I', v_view, v_role);
      end loop;
    end if;
  end loop;
end
$$;
