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
