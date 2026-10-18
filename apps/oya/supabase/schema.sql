-- おやノート schema(おやノート専用の Supabase プロジェクト。docs/adr/0001-architecture.md)
--
-- 何度流しても同じ結果になる書き方にする(db-deploy-oya.yml が、main へのマージのたびに丸ごと流す)。
--   create table if not exists / add column if not exists / drop policy if exists → create policy /
--   create or replace function。drop table・drop column は書かない(列の削除・改名は SQL Editor で手動)。
--
-- 権限の考え方(docs/SPEC.md §2):
--   - 親(parent)        : 自分の記録だけを作成・閲覧・編集できる。もう一方の親の記録は読めない。
--   - 家族管理者(admin)  : 家族の親の記録を読める。写真と利用者を管理する。記録は書けない。
--   - 家族閲覧者(viewer) : 家族の親の記録を読めるだけ。
--   - 家族に属さないアカウント・未ログイン: 何も読めない。
-- 権限は画面ではなく、ここ(RLS と security definer の関数)で検証する。
-- 複数の表をまとめて変える操作(家族の作成・招待・完了と写真の選択)は、関数(RPC)の中で1つのトランザクションにする。

-- =====================================================================
-- 家族・メンバー・招待
-- =====================================================================

create table if not exists oya_families (
  id uuid primary key default gen_random_uuid(),
  name text check (name is null or char_length(name) between 1 and 50),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 1人は1つの家族にだけ属する(user_id の unique)。表示名は「父」「母」など、画面で使う呼び名。
create table if not exists oya_members (
  family_id uuid not null references oya_families(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check (role in ('parent', 'admin', 'viewer')),
  display_name text not null check (char_length(display_name) between 1 and 20),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create index if not exists idx_oya_members_family_id on oya_members(family_id);

-- 招待コード。家族管理者だけが発行でき(create_oya_invite)、参加する人の役割と表示名を発行時に決める。
-- 24時間で失効し、1回だけ使える。
create table if not exists oya_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references oya_families(id) on delete cascade,
  code text not null unique,
  role text not null check (role in ('parent', 'admin', 'viewer')),
  display_name text not null check (char_length(display_name) between 1 and 20),
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_oya_invites_family_id on oya_invites(family_id);

-- =====================================================================
-- 判定用の関数
-- =====================================================================
-- RLS のポリシーから oya_members を引くと、oya_members 自身のポリシーで無限に再帰するため、
-- security definer の関数で「自分の家族」「自分の役割」を返す(あさノートの is_fellow_group_member と同じ方式)。

create or replace function oya_my_family()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select family_id from oya_members where user_id = auth.uid();
$$;

create or replace function oya_my_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from oya_members where user_id = auth.uid();
$$;

-- 記録の対象日の基準(日本時間の今日)。端末の時計・タイムゾーンには依存しない。
create or replace function oya_today_jst()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Tokyo')::date;
$$;

-- =====================================================================
-- 家族・メンバー・招待の RLS
-- =====================================================================
-- 書き込み(家族の作成・参加・招待の発行・メンバーの削除と役割の変更)は、下の関数だけで行う。
-- クライアントからの直接の insert / update は許可しない(ポリシーを作らない)。

alter table oya_families enable row level security;
alter table oya_members enable row level security;
alter table oya_invites enable row level security;

drop policy if exists "oya_families are readable by members" on oya_families;
create policy "oya_families are readable by members"
  on oya_families for select
  to authenticated
  using (id = oya_my_family());

-- 同じ家族のメンバー(表示名・役割)は、親を含む全員が読める(家族向けの画面で父・母を切り替えるため)。
-- メールアドレスはこの表に無く、返さない。
drop policy if exists "oya_members are readable by fellow members" on oya_members;
create policy "oya_members are readable by fellow members"
  on oya_members for select
  to authenticated
  using (family_id = oya_my_family());

-- 招待コードは家族管理者だけが読め、取り消せる(削除)。
drop policy if exists "oya_invites are readable by admins" on oya_invites;
create policy "oya_invites are readable by admins"
  on oya_invites for select
  to authenticated
  using (family_id = oya_my_family() and oya_my_role() = 'admin');

drop policy if exists "oya_invites are deletable by admins" on oya_invites;
create policy "oya_invites are deletable by admins"
  on oya_invites for delete
  to authenticated
  using (family_id = oya_my_family() and oya_my_role() = 'admin');

-- =====================================================================
-- 家族・招待・メンバー管理の関数(RPC)
-- =====================================================================

-- 家族を作り、作った人を最初の家族管理者にする。家族に属していない人だけが呼べる。
create or replace function create_oya_family(p_display_name text, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from oya_members where user_id = auth.uid()) then
    raise exception 'already_in_family';
  end if;

  insert into oya_families (name, created_by) values (p_name, auth.uid())
  returning id into v_family_id;

  insert into oya_members (family_id, user_id, role, display_name)
  values (v_family_id, auth.uid(), 'admin', p_display_name);

  return v_family_id;
end;
$$;

-- 招待コードを発行する(家族管理者だけ)。コードは紛らわしい文字(0/O、1/I)を除いた32種類の文字で8桁
-- (32^8 = 約1.1兆通り)。24時間で失効し、1回だけ使える。
create or replace function create_oya_invite(p_role text, p_display_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_family_id uuid;
  v_code text;
  i int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select family_id into v_family_id from oya_members where user_id = auth.uid() and role = 'admin';
  if v_family_id is null then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  loop
    v_code := '';
    for i in 1..8 loop
      -- gen_random_uuid() の先頭バイトは乱数(0〜255)。文字は32種類(256 の約数)なので、余りは偏らない。
      v_code := v_code || substr(v_alphabet, (get_byte(uuid_send(gen_random_uuid()), 0) % length(v_alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from oya_invites where code = v_code);
  end loop;

  insert into oya_invites (family_id, code, role, display_name, created_by)
  values (v_family_id, v_code, p_role, p_display_name, auth.uid());

  return v_code;
end;
$$;

-- 招待コードで家族に参加する。役割と表示名は、発行時に家族管理者が決めたもの。
create or replace function redeem_oya_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite oya_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_invite
  from oya_invites
  where code = upper(btrim(p_code))
    and used_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'invite_invalid';
  end if;

  if exists (select 1 from oya_members where user_id = auth.uid()) then
    raise exception 'already_in_family';
  end if;

  insert into oya_members (family_id, user_id, role, display_name)
  values (v_invite.family_id, auth.uid(), v_invite.role, v_invite.display_name);

  update oya_invites
  set used_at = now(), used_by = auth.uid()
  where id = v_invite.id;

  return v_invite.family_id;
end;
$$;

-- 家族管理者が0人になる変更を拒む(他のメンバーが残るのに、誰も管理できなくなるのを防ぐ)。
-- 呼び出し側で家族の行をロックしてから呼ぶこと(同時に2人の管理者が抜けるのを直列化するため)。
create or replace function oya_assert_admin_remains(p_family_id uuid, p_changing_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from oya_members where family_id = p_family_id and user_id <> p_changing_user)
     and not exists (
       select 1 from oya_members
       where family_id = p_family_id and user_id <> p_changing_user and role = 'admin'
     ) then
    raise exception 'last_admin';
  end if;
end;
$$;

-- メンバーを家族から外す。家族管理者は同じ家族の誰でも、それ以外の人は自分だけを外せる。
-- 外れた親の記録は家族に残る(家族管理者・閲覧者は引き続き読める。記録の削除はアカウントの削除で行う)。
create or replace function remove_oya_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_target oya_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  v_family_id := oya_my_family();
  select * into v_target from oya_members where user_id = p_user_id and family_id = v_family_id;
  if v_family_id is null or not found then
    raise exception 'member_not_found';
  end if;
  if p_user_id <> auth.uid() and oya_my_role() <> 'admin' then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  perform 1 from oya_families where id = v_family_id for update;
  if v_target.role = 'admin' then
    perform oya_assert_admin_remains(v_family_id, p_user_id);
  end if;

  delete from oya_members where user_id = p_user_id;
end;
$$;

-- メンバーの役割を変える(家族管理者だけ)。
create or replace function set_oya_member_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_target oya_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if oya_my_role() is distinct from 'admin' then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  v_family_id := oya_my_family();
  select * into v_target from oya_members where user_id = p_user_id and family_id = v_family_id;
  if not found then
    raise exception 'member_not_found';
  end if;

  perform 1 from oya_families where id = v_family_id for update;
  if v_target.role = 'admin' and p_role <> 'admin' then
    perform oya_assert_admin_remains(v_family_id, p_user_id);
  end if;

  update oya_members set role = p_role where user_id = p_user_id;
end;
$$;

-- =====================================================================
-- 日々の記録
-- =====================================================================
-- 1日 × 1人 = 1件(user_id, record_date の unique)。各項目は null = 未入力で、選んだ値と区別する。
-- 値は英字のコードで持ち、画面の文言は apps/oya 側で対応づける(文言・並びはコードを変えずに調整できる)。

create table if not exists oya_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  family_id uuid not null references oya_families(id) on delete cascade,
  record_date date not null,
  breakfast text check (breakfast is null or breakfast in ('ate', 'little', 'none')),
  lunch text check (lunch is null or lunch in ('ate', 'little', 'none')),
  dinner text check (dinner is null or dinner in ('ate', 'little', 'none')),
  -- 'unsure' = 本人が飲んだかどうか分からない(未確認)。null = まだ答えていない(未入力)。
  medication text check (medication is null or medication in ('taken', 'not_taken', 'unsure')),
  went_out boolean,
  shopping boolean,
  hospital boolean,
  condition text check (condition is null or condition in ('good', 'normal', 'bad')),
  memo text check (memo is null or char_length(memo) <= 2000),
  -- 完了した時刻。complete_oya_record() だけが入れる(クライアントの insert / update では変わらない)。
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, record_date)
);

create index if not exists idx_oya_records_family_date on oya_records(family_id, record_date desc);

-- 書き込みの検証と、変えてはいけない列の保護。
--   - 記録を作れるのは「親」だけ。family_id は本人の家族を入れる(クライアントの値は使わない)。
--   - 未来の日付(日本時間で今日より後)は拒む。過去の日付は制限しない(SPEC §4.2)。
--   - 持ち主・家族・日付・作成時刻は、更新で変えられない。
--   - completed_at はクライアントの insert / update では変わらない。complete_oya_record()(security definer で、
--     関数の所有者として実行される)の中からだけ変えられる。完了後に修正しても、完了状態は維持される。
create or replace function oya_records_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_from_client boolean := current_user in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    if v_from_client then
      if oya_my_role() is distinct from 'parent' then
        raise exception 'not_a_parent' using errcode = '42501';
      end if;
      new.family_id := oya_my_family();
      new.completed_at := null;
    end if;
    if new.record_date > oya_today_jst() then
      raise exception 'future_date';
    end if;
    new.created_at := now();
  else
    new.id := old.id;
    new.user_id := old.user_id;
    new.family_id := old.family_id;
    new.record_date := old.record_date;
    new.created_at := old.created_at;
    if v_from_client then
      new.completed_at := old.completed_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_oya_records_before_write on oya_records;
create trigger trg_oya_records_before_write
  before insert or update on oya_records
  for each row execute function oya_records_before_write();

alter table oya_records enable row level security;

-- 親は自分の記録だけ。家族管理者・閲覧者は、同じ家族の記録(=親の記録)を読める。
drop policy if exists "oya_records are readable by owner or family admins and viewers" on oya_records;
create policy "oya_records are readable by owner or family admins and viewers"
  on oya_records for select
  to authenticated
  using (
    user_id = auth.uid()
    or (family_id = oya_my_family() and oya_my_role() in ('admin', 'viewer'))
  );

drop policy if exists "oya_records are insertable by parents for themselves" on oya_records;
create policy "oya_records are insertable by parents for themselves"
  on oya_records for insert
  to authenticated
  with check (user_id = auth.uid() and oya_my_role() = 'parent');

drop policy if exists "oya_records are updatable by parents for themselves" on oya_records;
create policy "oya_records are updatable by parents for themselves"
  on oya_records for update
  to authenticated
  using (user_id = auth.uid() and oya_my_role() = 'parent')
  with check (user_id = auth.uid());

-- 削除のポリシーは作らない(記録は削除しない。SPEC §8。アカウントの削除で連鎖して消える)。

-- =====================================================================
-- 孫の写真
-- =====================================================================
-- 実体は Storage の非公開バケット grandchild-photos。パスは {family_id}/{id}.jpg(Storage のポリシーが先頭の
-- フォルダで家族を判定するため、check 制約で形を固定する)。クライアントが id を作ってからアップロードする。
-- active = false(無効化)の写真は、これからの抽選に使わない(すでに表示した写真は、親が見返せる)。

create table if not exists oya_photos (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references oya_families(id) on delete cascade,
  storage_path text not null unique,
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (storage_path = family_id::text || '/' || id::text || '.jpg')
);

create index if not exists idx_oya_photos_family_id on oya_photos(family_id);

-- 親ごと・日ごとに表示した写真(1日1回。primary key)。complete_oya_record() だけが入れる。
-- 写真を削除すると photo_id は null になる(その日の写真は見られなくなるが、再抽選はしない)。
create table if not exists oya_photo_reveals (
  user_id uuid not null references auth.users(id) on delete cascade,
  record_date date not null,
  photo_id uuid references oya_photos(id) on delete set null,
  revealed_at timestamptz not null default now(),
  primary key (user_id, record_date)
);

create index if not exists idx_oya_photo_reveals_photo_id on oya_photo_reveals(photo_id);

-- 写真の行は、追加後に active 以外を変えられない(パスと家族の対応を崩さない)。
create or replace function oya_photos_before_update()
returns trigger
language plpgsql
as $$
begin
  new.id := old.id;
  new.family_id := old.family_id;
  new.storage_path := old.storage_path;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists trg_oya_photos_before_update on oya_photos;
create trigger trg_oya_photos_before_update
  before update on oya_photos
  for each row execute function oya_photos_before_update();

alter table oya_photos enable row level security;
alter table oya_photo_reveals enable row level security;

-- 家族管理者・閲覧者は家族の写真を読める。親は、自分に表示された写真だけを読める。
drop policy if exists "oya_photos are readable by family or revealed parents" on oya_photos;
create policy "oya_photos are readable by family or revealed parents"
  on oya_photos for select
  to authenticated
  using (
    (family_id = oya_my_family() and oya_my_role() in ('admin', 'viewer'))
    or exists (
      select 1 from oya_photo_reveals r
      where r.user_id = auth.uid() and r.photo_id = oya_photos.id
    )
  );

drop policy if exists "oya_photos are insertable by family admins" on oya_photos;
create policy "oya_photos are insertable by family admins"
  on oya_photos for insert
  to authenticated
  with check (family_id = oya_my_family() and oya_my_role() = 'admin' and created_by = auth.uid());

drop policy if exists "oya_photos are updatable by family admins" on oya_photos;
create policy "oya_photos are updatable by family admins"
  on oya_photos for update
  to authenticated
  using (family_id = oya_my_family() and oya_my_role() = 'admin');

drop policy if exists "oya_photos are deletable by family admins" on oya_photos;
create policy "oya_photos are deletable by family admins"
  on oya_photos for delete
  to authenticated
  using (family_id = oya_my_family() and oya_my_role() = 'admin');

-- 表示の履歴は本人だけが読める。書き込みのポリシーは作らない(complete_oya_record() だけが入れる)。
drop policy if exists "oya_photo_reveals are readable by owner" on oya_photo_reveals;
create policy "oya_photo_reveals are readable by owner"
  on oya_photo_reveals for select
  to authenticated
  using (user_id = auth.uid());

-- =====================================================================
-- 記録の完了と、写真の選択(RPC)
-- =====================================================================
-- 保存済みの記録を完了にし、その日の写真を返す。何度呼んでも同じ結果になる。
--   - 完了: completed_at が空のときだけ入れる(2回目以降は変えない)。
--   - 写真: その日(本人・日付)にまだ表示していなければ、家族の有効な写真から1枚をランダムに選ぶ。
--     直前に表示した写真は、ほかに候補があれば外す。選んだ写真はその日に固定され、修正しても再抽選しない。
--   - 写真が1枚も無いときは、完了だけ行い、写真は返さない(表示の履歴も作らない。写真が追加された後に
--     もう一度呼ぶと、その日の写真が選ばれる)。
-- 記録の保存(oya_records への upsert)が成功してから呼ぶ。記録が無ければ record_not_found。
create or replace function complete_oya_record(p_record_date date)
returns table (photo_id uuid, storage_path text, completed_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_record oya_records%rowtype;
  v_last_photo uuid;
  v_photo uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if oya_my_role() is distinct from 'parent' then
    raise exception 'not_a_parent' using errcode = '42501';
  end if;

  select * into v_record from oya_records r
  where r.user_id = v_uid and r.record_date = p_record_date
  for update;
  if not found then
    raise exception 'record_not_found';
  end if;

  if v_record.completed_at is null then
    update oya_records r set completed_at = now() where r.id = v_record.id
    returning * into v_record;
  end if;

  if not exists (select 1 from oya_photo_reveals pr where pr.user_id = v_uid and pr.record_date = p_record_date) then
    select pr.photo_id into v_last_photo
    from oya_photo_reveals pr
    where pr.user_id = v_uid and pr.photo_id is not null
    order by pr.revealed_at desc, pr.record_date desc
    limit 1;

    select p.id into v_photo
    from oya_photos p
    where p.family_id = v_record.family_id and p.active and p.id is distinct from v_last_photo
    order by random()
    limit 1;

    -- 有効な写真が直前の1枚しか無いときは、それを使う。
    if v_photo is null then
      select p.id into v_photo
      from oya_photos p
      where p.family_id = v_record.family_id and p.active
      limit 1;
    end if;

    if v_photo is not null then
      insert into oya_photo_reveals (user_id, record_date, photo_id, revealed_at)
      values (v_uid, p_record_date, v_photo, clock_timestamp());
    end if;
  end if;

  return query
    select pr.photo_id, p.storage_path, v_record.completed_at
    from (select 1) as one
    left join oya_photo_reveals pr on pr.user_id = v_uid and pr.record_date = p_record_date
    left join oya_photos p on p.id = pr.photo_id;
end;
$$;

-- =====================================================================
-- 関数の実行権
-- =====================================================================
-- Supabase は新しい関数に anon / authenticated への実行権を自動で付ける。RPC はログイン中の利用者だけが呼べるようにする
-- (関数の中でも auth.uid() を確かめる)。oya_assert_admin_remains は内部用なので、誰にも公開しない。
revoke all on function create_oya_family(text, text) from public, anon;
revoke all on function create_oya_invite(text, text) from public, anon;
revoke all on function redeem_oya_invite(text) from public, anon;
revoke all on function remove_oya_member(uuid) from public, anon;
revoke all on function set_oya_member_role(uuid, text) from public, anon;
revoke all on function complete_oya_record(date) from public, anon;
revoke all on function oya_assert_admin_remains(uuid, uuid) from public, anon, authenticated;

grant execute on function create_oya_family(text, text) to authenticated;
grant execute on function create_oya_invite(text, text) to authenticated;
grant execute on function redeem_oya_invite(text) to authenticated;
grant execute on function remove_oya_member(uuid) to authenticated;
grant execute on function set_oya_member_role(uuid, text) to authenticated;
grant execute on function complete_oya_record(date) to authenticated;

-- =====================================================================
-- Storage(孫の写真の実体)
-- =====================================================================
-- 非公開バケット。表示は署名付きURL(有効期限は短く。ADR 0001)。
insert into storage.buckets (id, name, public)
values ('grandchild-photos', 'grandchild-photos', false)
on conflict (id) do nothing;

-- 読み取り: 家族管理者・閲覧者は自分の家族のフォルダ。親は、自分に表示された写真のファイルだけ。
drop policy if exists "oya: grandchild photos are readable by family or revealed" on storage.objects;
create policy "oya: grandchild photos are readable by family or revealed"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'grandchild-photos'
    and (
      ((storage.foldername(name))[1] = oya_my_family()::text and oya_my_role() in ('admin', 'viewer'))
      or exists (
        select 1
        from oya_photo_reveals r
        join oya_photos p on p.id = r.photo_id
        where r.user_id = auth.uid() and p.storage_path = storage.objects.name
      )
    )
  );

-- 追加・更新・削除: 家族管理者が、自分の家族のフォルダにだけ。
drop policy if exists "oya: grandchild photos are uploadable by family admins" on storage.objects;
create policy "oya: grandchild photos are uploadable by family admins"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'grandchild-photos'
    and (storage.foldername(name))[1] = oya_my_family()::text
    and oya_my_role() = 'admin'
  );

drop policy if exists "oya: grandchild photos are updatable by family admins" on storage.objects;
create policy "oya: grandchild photos are updatable by family admins"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'grandchild-photos'
    and (storage.foldername(name))[1] = oya_my_family()::text
    and oya_my_role() = 'admin'
  );

drop policy if exists "oya: grandchild photos are deletable by family admins" on storage.objects;
create policy "oya: grandchild photos are deletable by family admins"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'grandchild-photos'
    and (storage.foldername(name))[1] = oya_my_family()::text
    and oya_my_role() = 'admin'
  );
