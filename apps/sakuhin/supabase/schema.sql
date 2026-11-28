-- さくひんノート固有の表・関数・Storage(docs/SPEC.md §8・§9.2)。
--
-- **共有モード**: あさノート・よるノートと同じ Supabase プロジェクトに適用する(§11 D7)。
-- 共通表(groups / group_members / children など)の定義の正は、ルートの supabase/schema.sql(あさノート)。
-- このファイルは、sakuhin_ で始まる表・関数・トリガーと、写真のバケット(sakuhin-works)だけに触れる
-- (scripts/check-schema-safety.mjs が検査する。例外は、children の削除を止めるトリガー1つだけ)。
--
-- 冪等に書く(create table if not exists / drop policy if exists → create policy / create or replace function)。
-- 何度流しても同じ結果になる(CI・権限のテストでも2回適用して確かめる)。列の削除・リネームはこの仕組みでは届かない。
--
-- 見られる範囲の考え方: 作品・写真は「その子どもを見られる人」が見られる。子どもを見られる人は、
-- 共通表 children の RLS(登録した人と、その人と同じグループのメンバー)で決まる。ポリシーの中の
-- children への問い合わせには、問い合わせた人の RLS がかかるので、子どもの見える範囲がそのまま作品に及ぶ。
-- ひとりで使う人・家族で使う人・家族を抜けた人(子どもは残る家族へ移る)を、同じ仕組みで扱える。

-- ---------------------------------------------------------------------
-- 子どもごとの設定(館の名前)。誕生日は共通の children.birth_date(§11 D8)。
-- ---------------------------------------------------------------------
create table if not exists sakuhin_child_settings (
  child_id uuid primary key references children(id) on delete cascade,
  -- 空なら、画面で「〇〇ちゃん美術館」(〇〇は子どもの名前)と表示する。
  museum_name text check (museum_name is null or char_length(museum_name) between 1 and 30),
  updated_at timestamptz not null default now()
);

alter table sakuhin_child_settings enable row level security;

drop policy if exists "sakuhin_child_settings are readable by those who can see the child" on sakuhin_child_settings;
drop policy if exists "sakuhin_child_settings are insertable by those who can see the child" on sakuhin_child_settings;
drop policy if exists "sakuhin_child_settings are updatable by those who can see the child" on sakuhin_child_settings;
drop policy if exists "sakuhin_child_settings are deletable by those who can see the child" on sakuhin_child_settings;

create policy "sakuhin_child_settings are readable by those who can see the child"
  on sakuhin_child_settings for select to authenticated
  using (exists (select 1 from children c where c.id = sakuhin_child_settings.child_id));

create policy "sakuhin_child_settings are insertable by those who can see the child"
  on sakuhin_child_settings for insert to authenticated
  with check (exists (select 1 from children c where c.id = sakuhin_child_settings.child_id));

create policy "sakuhin_child_settings are updatable by those who can see the child"
  on sakuhin_child_settings for update to authenticated
  using (exists (select 1 from children c where c.id = sakuhin_child_settings.child_id))
  with check (exists (select 1 from children c where c.id = sakuhin_child_settings.child_id));

create policy "sakuhin_child_settings are deletable by those who can see the child"
  on sakuhin_child_settings for delete to authenticated
  using (exists (select 1 from children c where c.id = sakuhin_child_settings.child_id));

-- 画面から更新できるのは館の名前だけ(child_id を別の子どもへ付け替えさせない)。
revoke update on sakuhin_child_settings from anon, authenticated;
grant update (museum_name) on sakuhin_child_settings to authenticated;

-- ---------------------------------------------------------------------
-- 作品(§5.3)
-- ---------------------------------------------------------------------
create table if not exists sakuhin_works (
  -- 端末で決めて送る(再試行しても同じ行になり、二重に収蔵されない。§7)。
  id uuid primary key default gen_random_uuid(),
  -- 子どもを削除すると作品も消える。ただし画面からの子どもの削除は、作品があるうちはトリガーで止める(下)。
  -- 止めないのは退会(アカウントの削除)の連鎖だけ(§11 D11)。
  child_id uuid not null references children(id) on delete cascade,
  -- 収蔵した人。退会しても作品は家族に残す(§12 C1)ので、null にする。
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  made_on date not null,
  title text not null default '' check (char_length(title) <= 50),
  -- 種類(絵 / 工作 / 書写・文字 / その他)。表示名は画面の定義(1か所)で持つ。
  kind text not null default 'drawing' check (kind in ('drawing', 'craft', 'calligraphy', 'other')),
  memo text not null default '' check (char_length(memo) <= 200),
  -- 額縁(§6.1)。auto は種類から決める。
  frame text not null default 'auto' check (frame in ('auto', 'wood', 'white', 'black', 'gold', 'color')),
  is_featured boolean not null default false,
  keep_original boolean not null default false,
  -- 写真の置き場所(バケット sakuhin-works の中のパス)。収蔵した人のフォルダに、作品の id で置く。
  -- 形を固定して、ほかの人の写真を自分の作品として指せないようにする。
  image_path text not null,
  thumb_path text not null,
  width integer not null check (width between 1 and 4000),
  height integer not null check (height between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sakuhin_works_image_path_check check (image_path = created_by::text || '/' || id::text || '.jpg' or created_by is null),
  constraint sakuhin_works_thumb_path_check check (thumb_path = created_by::text || '/' || id::text || '_thumb.jpg' or created_by is null)
);

create index if not exists idx_sakuhin_works_child_made_on on sakuhin_works(child_id, made_on desc);
create index if not exists idx_sakuhin_works_image_path on sakuhin_works(image_path);
create index if not exists idx_sakuhin_works_thumb_path on sakuhin_works(thumb_path);

alter table sakuhin_works enable row level security;

drop policy if exists "sakuhin_works are readable by those who can see the child" on sakuhin_works;
drop policy if exists "sakuhin_works are insertable by those who can see the child" on sakuhin_works;
drop policy if exists "sakuhin_works are updatable by those who can see the child" on sakuhin_works;
drop policy if exists "sakuhin_works are deletable by those who can see the child" on sakuhin_works;

create policy "sakuhin_works are readable by those who can see the child"
  on sakuhin_works for select to authenticated
  using (exists (select 1 from children c where c.id = sakuhin_works.child_id));

-- 収蔵は、自分の名前で、見られる子どもに対してだけ。
create policy "sakuhin_works are insertable by those who can see the child"
  on sakuhin_works for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (select 1 from children c where c.id = sakuhin_works.child_id)
  );

-- 家族のメンバーなら、誰が収蔵した作品でも直せる(§2)。作者(子ども)を直すときも、見られる子どもに限る。
create policy "sakuhin_works are updatable by those who can see the child"
  on sakuhin_works for update to authenticated
  using (exists (select 1 from children c where c.id = sakuhin_works.child_id))
  with check (exists (select 1 from children c where c.id = sakuhin_works.child_id));

create policy "sakuhin_works are deletable by those who can see the child"
  on sakuhin_works for delete to authenticated
  using (exists (select 1 from children c where c.id = sakuhin_works.child_id));

-- 画面から直せる列だけを更新できるようにする(収蔵した人・写真の置き場所・大きさは変えさせない)。
revoke update on sakuhin_works from anon, authenticated;
grant update (child_id, made_on, title, kind, memo, frame, is_featured, keep_original) on sakuhin_works to authenticated;

-- 更新日時はサーバーで付ける(端末の時計に頼らない)。
create or replace function sakuhin_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sakuhin_works_touch_updated_at on sakuhin_works;
create trigger sakuhin_works_touch_updated_at
  before update on sakuhin_works
  for each row execute function sakuhin_touch_updated_at();

drop trigger if exists sakuhin_child_settings_touch_updated_at on sakuhin_child_settings;
create trigger sakuhin_child_settings_touch_updated_at
  before update on sakuhin_child_settings
  for each row execute function sakuhin_touch_updated_at();

-- ---------------------------------------------------------------------
-- 作品がある子どもは、画面から削除できない(§11 D11)
-- ---------------------------------------------------------------------
-- あさノート・よるノートの「共有」画面で子どもを削除すると、外部キーの連鎖で作品まで消えてしまう。
-- 記念の作品が別のアプリでの操作で消えないよう、ログイン中の利用者による削除(auth.uid() がある)を止める。
-- 退会(service role によるアカウントの削除。auth.uid() が無い)の連鎖は止めない(止めると退会できなくなる)。
-- 画面は、エラーの文言 sakuhin_child_has_works を見て案内を出す(@note/core の子どもの削除)。
create or replace function sakuhin_prevent_child_delete_with_works()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and exists (select 1 from sakuhin_works where child_id = old.id) then
    raise exception 'sakuhin_child_has_works'
      using hint = 'さくひんノートに作品があるため、この子どもは削除できません。';
  end if;
  return old;
end;
$$;

revoke all on function sakuhin_prevent_child_delete_with_works() from public;

drop trigger if exists sakuhin_keep_child_with_works on children;
create trigger sakuhin_keep_child_with_works
  before delete on children
  for each row execute function sakuhin_prevent_child_delete_with_works();

-- ---------------------------------------------------------------------
-- 写真(Storage。非公開のバケット。§8)
-- ---------------------------------------------------------------------
-- 置き場所は `<収蔵した人の id>/<作品の id>.jpg` と `<収蔵した人の id>/<作品の id>_thumb.jpg`。
-- 端末は、写真を先に送ってから作品の行を作る(行があるのに写真が無い、を作らない。§5.6・§7)。
insert into storage.buckets (id, name, public)
values ('sakuhin-works', 'sakuhin-works', false)
on conflict (id) do nothing;

-- その写真を使っている作品があるか(RLS に関係なく調べる)。家族を抜けた人が、自分のフォルダにある写真
-- (残った家族の作品が使っている)を消せないようにするため。
create or replace function sakuhin_storage_path_in_use(p_name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from sakuhin_works where image_path = p_name or thumb_path = p_name);
$$;

revoke all on function sakuhin_storage_path_in_use(text) from public;
grant execute on function sakuhin_storage_path_in_use(text) to authenticated;

drop policy if exists "sakuhin works photos are readable by those who can see the work" on storage.objects;
drop policy if exists "sakuhin works photos are uploadable into own folder" on storage.objects;
drop policy if exists "sakuhin works photos are deletable by those who can see the work or unused own" on storage.objects;

-- 見られるのは、見られる作品が使っている写真(作品の RLS を通す)と、自分のフォルダにあって
-- どの作品も使っていない写真(収蔵に失敗したときの後始末。削除は対象の行を読める必要があるため)。
create policy "sakuhin works photos are readable by those who can see the work"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'sakuhin-works'
    and (
      exists (
        select 1 from sakuhin_works w
        where w.image_path = storage.objects.name or w.thumb_path = storage.objects.name
      )
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and not sakuhin_storage_path_in_use(name)
      )
    )
  );

-- 送れるのは、自分のフォルダへだけ。上書き(update)は許さない(同じ id の作品は1つだけ)。
create policy "sakuhin works photos are uploadable into own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sakuhin-works'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 消せるのは、見られる作品が使っている写真(作品の削除のとき)と、
-- 自分のフォルダにあって、どの作品も使っていない写真(収蔵に失敗したときの後始末)。
create policy "sakuhin works photos are deletable by those who can see the work or unused own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'sakuhin-works'
    and (
      exists (
        select 1 from sakuhin_works w
        where w.image_path = storage.objects.name or w.thumb_path = storage.objects.name
      )
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and not sakuhin_storage_path_in_use(name)
      )
    )
  );
