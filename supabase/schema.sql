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

-- 複数の子どもがいる家庭向け。groups同様「作成者 + 同じグループのメンバー」が
-- 閲覧できる共有リストとして扱う(id はrecords.child_idから参照する)。
create table if not exists children (
  id uuid primary key default uuid_generate_v4(),
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  created_at timestamptz not null default now()
);

create index if not exists idx_children_created_by on children(created_by);

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
