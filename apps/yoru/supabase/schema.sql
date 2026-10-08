-- よるノート: 夜の記録(evening_*) schema
--
-- 前提(共有モード・docs/SPEC.md §7): groups / group_members / group_invites / children と
-- create_group() / redeem_group_invite() / get_group_members() は、あさノート側の
-- supabase/schema.sql が正。ここでは**よるノート固有の表だけ**を作る・変更する。
-- 共通表に対して DROP / ALTER を行わないこと(あさノートの表を壊さないため)。
-- 分離モードでは、あさノートの共通部(group* / children と関連関数)を先に適用すること。

create extension if not exists "uuid-ossp";

create table if not exists evening_records (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid references children(id) on delete set null,
  record_date date not null,
  outcome text check (outcome is null or outcome in ('calm', 'rough', 'storm')),
  t_arrive time,
  t_hw_start time,
  t_hw_end time,
  t_dinner time,
  t_bath time,
  t_prep time,
  t_bed time,
  dinner text check (dinner is null or dinner in ('ate', 'little', 'no')),
  dinner_why text[] not null default '{}',
  free_tags text[] not null default '{}',
  friend_tags text[] not null default '{}',
  trigger_tags text[] not null default '{}',
  behavior_tags text[] not null default '{}',
  response_tags text[] not null default '{}',
  response_effect text check (response_effect is null or response_effect in ('good', 'mid', 'bad')),
  body_tags text[] not null default '{}',
  memo text check (memo is null or char_length(memo) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 節目(帰宅・宿題開始・お風呂・消灯)は時刻ではなく時間帯(early / mid / late)を保存する。
-- 旧い time 列は text へ変換し、入っていた時刻は同じ基準で帯に寄せる。何度流しても同じ結果になる
-- (すでに text なら、帯のidはそのまま残る)。t_hw_end / t_prep は廃止した項目で、アプリは読み書きしない。
alter table evening_records
  alter column t_arrive type text using (
    case when t_arrive::text ~ '^[0-9]{2}:[0-9]{2}' then
      case when t_arrive::text < '14:00' then 'early' when t_arrive::text < '15:00' then 'mid' else 'late' end
    else t_arrive::text end),
  alter column t_hw_start type text using (
    case when t_hw_start::text ~ '^[0-9]{2}:[0-9]{2}' then
      case when t_hw_start::text < '17:00' then 'early' when t_hw_start::text < '19:00' then 'mid' else 'late' end
    else t_hw_start::text end),
  alter column t_bath type text using (
    case when t_bath::text ~ '^[0-9]{2}:[0-9]{2}' then
      case when t_bath::text < '17:00' then 'early' when t_bath::text < '19:00' then 'mid' else 'late' end
    else t_bath::text end),
  alter column t_bed type text using (
    case when t_bed::text ~ '^[0-9]{2}:[0-9]{2}' then
      case when t_bed::text < '20:00' then 'early' when t_bed::text < '21:00' then 'mid' else 'late' end
    else t_bed::text end);

create index if not exists idx_evening_records_user_id on evening_records(user_id);
create index if not exists idx_evening_records_record_date on evening_records(record_date desc);
create index if not exists idx_evening_records_child_id on evening_records(child_id);

-- 記録に添付する写真。実体は Storage の evening-photos バケット(非公開)にあり、
-- ここにはパスだけを持つ。パスは {user_id}/{record_id}/{photo_id}.jpg。
create table if not exists evening_photos (
  id uuid primary key default uuid_generate_v4(),
  record_id uuid not null references evening_records(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_evening_photos_record_id on evening_photos(record_id);

-- 1記録あたり5枚まで(src/constants/choices.ts の PHOTO_MAX_PER_RECORD と同じ値)。
create or replace function enforce_evening_photo_limit()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from evening_photos where record_id = new.record_id) >= 5 then
    raise exception 'photo_limit_exceeded';
  end if;
  return new;
end;
$$;

drop trigger if exists evening_photos_limit on evening_photos;
create trigger evening_photos_limit
  before insert on evening_photos
  for each row execute function enforce_evening_photo_limit();

alter table evening_records enable row level security;
alter table evening_photos enable row level security;

-- evening_records: 本人 + 同じグループのメンバーの記録を閲覧可能。編集・削除は本人のみ。
drop policy if exists "evening_records are readable by owner or group members" on evening_records;
drop policy if exists "evening_records are insertable by owner" on evening_records;
drop policy if exists "evening_records are updatable by owner" on evening_records;
drop policy if exists "evening_records are deletable by owner" on evening_records;

create policy "evening_records are readable by owner or group members"
  on evening_records for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from group_members gm_self
      join group_members gm_owner on gm_owner.group_id = gm_self.group_id
      where gm_self.user_id = auth.uid()
        and gm_owner.user_id = evening_records.user_id
    )
  );

create policy "evening_records are insertable by owner"
  on evening_records for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "evening_records are updatable by owner"
  on evening_records for update
  to authenticated
  using (auth.uid() = user_id);

create policy "evening_records are deletable by owner"
  on evening_records for delete
  to authenticated
  using (auth.uid() = user_id);

-- evening_photos: 記録と同じ可視範囲。追加・削除は本人のみ(かつ自分の記録に対してだけ)。
drop policy if exists "evening_photos are readable by owner or group members" on evening_photos;
drop policy if exists "evening_photos are insertable by owner" on evening_photos;
drop policy if exists "evening_photos are deletable by owner" on evening_photos;

create policy "evening_photos are readable by owner or group members"
  on evening_photos for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from group_members gm_self
      join group_members gm_owner on gm_owner.group_id = gm_self.group_id
      where gm_self.user_id = auth.uid()
        and gm_owner.user_id = evening_photos.user_id
    )
  );

create policy "evening_photos are insertable by owner"
  on evening_photos for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (select 1 from evening_records r where r.id = record_id and r.user_id = auth.uid())
  );

create policy "evening_photos are deletable by owner"
  on evening_photos for delete
  to authenticated
  using (auth.uid() = user_id);

-- Storage: 非公開バケット。ファイルの最初のフォルダがアップロードした本人のuser_id。
insert into storage.buckets (id, name, public)
values ('evening-photos', 'evening-photos', false)
on conflict (id) do nothing;

drop policy if exists "evening photos are readable by owner or group members" on storage.objects;
drop policy if exists "evening photos are uploadable by owner" on storage.objects;
drop policy if exists "evening photos are deletable by owner" on storage.objects;

create policy "evening photos are readable by owner or group members"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'evening-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from group_members gm_self
        join group_members gm_owner on gm_owner.group_id = gm_self.group_id
        where gm_self.user_id = auth.uid()
          and gm_owner.user_id::text = (storage.foldername(name))[1]
      )
    )
  );

create policy "evening photos are uploadable by owner"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'evening-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "evening photos are deletable by owner"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'evening-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- 夜のリマインドPush通知。あさノートの push_subscriptions / notification_settings とは
-- **別の表**にする(共有モードでは同じDBに同居するため、混ぜるとあさノートの朝の通知が
-- よるノートの購読へ届いたり、リマインド時刻が衝突したりする)。

-- Push通知の購読情報。1ユーザーが複数端末を持ちうるため endpoint ごとに複数行を許容する。
create table if not exists evening_push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_evening_push_subscriptions_user_id on evening_push_subscriptions(user_id);

alter table evening_push_subscriptions enable row level security;

drop policy if exists "evening_push_subscriptions are readable by owner" on evening_push_subscriptions;
drop policy if exists "evening_push_subscriptions are insertable by owner" on evening_push_subscriptions;
drop policy if exists "evening_push_subscriptions are updatable by owner" on evening_push_subscriptions;
drop policy if exists "evening_push_subscriptions are deletable by owner" on evening_push_subscriptions;

create policy "evening_push_subscriptions are readable by owner"
  on evening_push_subscriptions for select to authenticated using (auth.uid() = user_id);
create policy "evening_push_subscriptions are insertable by owner"
  on evening_push_subscriptions for insert to authenticated with check (auth.uid() = user_id);
create policy "evening_push_subscriptions are updatable by owner"
  on evening_push_subscriptions for update to authenticated using (auth.uid() = user_id);
create policy "evening_push_subscriptions are deletable by owner"
  on evening_push_subscriptions for delete to authenticated using (auth.uid() = user_id);

-- 通知設定。ユーザー1人につき1行。reminder_time の既定は21:00(SPEC §4)。
create table if not exists evening_notification_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reminder_time time not null default '21:00',
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- パートナーが今夜の記録を追加したときのPush通知を受け取るか。既定はOFF(行が無い人にも送らない)。
-- 既存の環境にも反映されるよう、create table とは別に add column if not exists で足す。
alter table evening_notification_settings
  add column if not exists notify_partner_record boolean not null default false;

alter table evening_notification_settings enable row level security;

drop policy if exists "evening_notification_settings are readable by owner" on evening_notification_settings;
drop policy if exists "evening_notification_settings are insertable by owner" on evening_notification_settings;
drop policy if exists "evening_notification_settings are updatable by owner" on evening_notification_settings;
drop policy if exists "evening_notification_settings are deletable by owner" on evening_notification_settings;

create policy "evening_notification_settings are readable by owner"
  on evening_notification_settings for select to authenticated using (auth.uid() = user_id);
create policy "evening_notification_settings are insertable by owner"
  on evening_notification_settings for insert to authenticated with check (auth.uid() = user_id);
create policy "evening_notification_settings are updatable by owner"
  on evening_notification_settings for update to authenticated using (auth.uid() = user_id);
create policy "evening_notification_settings are deletable by owner"
  on evening_notification_settings for delete to authenticated using (auth.uid() = user_id);

-- 試したこと(ルール変更)と検討事項ボード(SPEC §4.4)。家族(グループ)で共有する設定情報なので、
-- 閲覧・編集・削除は作成者と同じグループのメンバーなら誰でもできる(children と違い、片方の親が
-- 立てた項目をもう片方が解決済みにできる必要があるため)。
create table if not exists evening_rules (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid references children(id) on delete set null, -- null = 子ども全員
  title text not null check (char_length(title) between 1 and 100),
  started_on date not null,
  ended_on date,
  created_at timestamptz not null default now()
);

create table if not exists evening_concerns (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table evening_rules enable row level security;
alter table evening_concerns enable row level security;

-- 更新ポリシーは同じグループのメンバーにも開いているため、user_id を書き換えて他の人の
-- 持ち物にしたり自分の持ち物にしたりできてしまう。作成者(user_id)は変更不可にする。
create or replace function evening_prevent_owner_change()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'owner_change_not_allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists evening_rules_keep_owner on evening_rules;
create trigger evening_rules_keep_owner
  before update on evening_rules
  for each row execute function evening_prevent_owner_change();

drop trigger if exists evening_concerns_keep_owner on evening_concerns;
create trigger evening_concerns_keep_owner
  before update on evening_concerns
  for each row execute function evening_prevent_owner_change();

drop policy if exists "evening_rules are readable by owner or group members" on evening_rules;
drop policy if exists "evening_rules are insertable by owner" on evening_rules;
drop policy if exists "evening_rules are updatable by owner or group members" on evening_rules;
drop policy if exists "evening_rules are deletable by owner or group members" on evening_rules;
drop policy if exists "evening_concerns are readable by owner or group members" on evening_concerns;
drop policy if exists "evening_concerns are insertable by owner" on evening_concerns;
drop policy if exists "evening_concerns are updatable by owner or group members" on evening_concerns;
drop policy if exists "evening_concerns are deletable by owner or group members" on evening_concerns;

create policy "evening_rules are readable by owner or group members"
  on evening_rules for select to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from group_members gm_self
      join group_members gm_owner on gm_owner.group_id = gm_self.group_id
      where gm_self.user_id = auth.uid() and gm_owner.user_id = evening_rules.user_id
    )
  );
create policy "evening_rules are insertable by owner"
  on evening_rules for insert to authenticated with check (auth.uid() = user_id);
create policy "evening_rules are updatable by owner or group members"
  on evening_rules for update to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from group_members gm_self
      join group_members gm_owner on gm_owner.group_id = gm_self.group_id
      where gm_self.user_id = auth.uid() and gm_owner.user_id = evening_rules.user_id
    )
  );
create policy "evening_rules are deletable by owner or group members"
  on evening_rules for delete to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from group_members gm_self
      join group_members gm_owner on gm_owner.group_id = gm_self.group_id
      where gm_self.user_id = auth.uid() and gm_owner.user_id = evening_rules.user_id
    )
  );

create policy "evening_concerns are readable by owner or group members"
  on evening_concerns for select to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from group_members gm_self
      join group_members gm_owner on gm_owner.group_id = gm_self.group_id
      where gm_self.user_id = auth.uid() and gm_owner.user_id = evening_concerns.user_id
    )
  );
create policy "evening_concerns are insertable by owner"
  on evening_concerns for insert to authenticated with check (auth.uid() = user_id);
create policy "evening_concerns are updatable by owner or group members"
  on evening_concerns for update to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from group_members gm_self
      join group_members gm_owner on gm_owner.group_id = gm_self.group_id
      where gm_self.user_id = auth.uid() and gm_owner.user_id = evening_concerns.user_id
    )
  );
create policy "evening_concerns are deletable by owner or group members"
  on evening_concerns for delete to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from group_members gm_self
      join group_members gm_owner on gm_owner.group_id = gm_self.group_id
      where gm_self.user_id = auth.uid() and gm_owner.user_id = evening_concerns.user_id
    )
  );
