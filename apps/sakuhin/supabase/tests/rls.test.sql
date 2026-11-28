-- さくひんノートの権限(RLS・列の権限・Storage・トリガー)のテスト。素の Postgres で実行する
-- (scripts/test-db.sh、CI の ci-sakuhin.yml)。おやノートの supabase/tests/rls.test.sql と同じ書き方。
--
-- 前提: supabase/ci/supabase-stub.sql → ルートの supabase/schema.sql(共通表の正)→ supabase/schema.sql を適用済みの DB。
-- 全体を1つのトランザクションで実行し、最後に rollback する(DB に何も残さない)。
-- 利用者の切り替えは、PostgREST と同じく「JWT の sub を設定して authenticated ロールになる」ことで再現する
-- (下の :as_xxx)。失敗すると FAIL: ... の例外で止まる(psql -v ON_ERROR_STOP=1 で実行すること)。
--
-- 登場人物
--   家族A: ママ(mom)/ パパ(dad)。ママが「はな」、パパが「そうた」を登録している
--   ひとり(solo): グループに属さない。自分で「ゆい」を登録している
--   家族B: 別の家族の人(outsider)。「けん」を登録している
--   未ログイン(anon)

\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;

begin;

-- ---------------------------------------------------------------------
-- テスト用の補助(トランザクションごと消える)
-- ---------------------------------------------------------------------
create schema sk_test;
grant usage on schema sk_test to anon, authenticated;

create function sk_test.eq(label text, actual anyelement, expected anyelement) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL: % (expected %, got %)', label, expected, actual;
  end if;
  raise notice 'ok: %', label;
end $$;

-- select でも、returning 付きの insert / update / delete でも、行数を返す。
create function sk_test.count(sql text) returns bigint
language plpgsql as $$
declare
  n bigint;
begin
  execute 'with t as (' || sql || ') select count(*) from t' into n;
  return n;
end $$;

-- エラーにならずに実行できること。
create function sk_test.ok(label text, sql text) returns void
language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise exception 'FAIL: % (error: %)', label, sqlerrm;
  end;
  raise notice 'ok: %', label;
end $$;

create function sk_test.raises(label text, sql text, pattern text) returns void
language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if sqlerrm ~ pattern then
      raise notice 'ok: % (%)', label, sqlerrm;
      return;
    end if;
    raise exception 'FAIL: % (unexpected error: %)', label, sqlerrm;
  end;
  raise exception 'FAIL: % (no error)', label;
end $$;

-- 書き込みが拒否されること(RLS で0件になる、またはエラーになる)。
create function sk_test.denied(label text, sql text) returns void
language plpgsql as $$
declare
  n bigint;
begin
  begin
    n := sk_test.count(sql);
  exception when others then
    raise notice 'ok: % (%)', label, sqlerrm;
    return;
  end;
  if n <> 0 then
    raise exception 'FAIL: % (expected denied, but % rows affected)', label, n;
  end if;
  raise notice 'ok: % (0 rows)', label;
end $$;

\set mom      '''11111111-1111-1111-1111-111111111111'''
\set dad      '''22222222-2222-2222-2222-222222222222'''
\set solo     '''33333333-3333-3333-3333-333333333333'''
\set outsider '''44444444-4444-4444-4444-444444444444'''

\set hana '''aaaaaaaa-0000-0000-0000-000000000001'''
\set sota '''aaaaaaaa-0000-0000-0000-000000000002'''
\set yui  '''aaaaaaaa-0000-0000-0000-000000000003'''
\set ken  '''aaaaaaaa-0000-0000-0000-000000000004'''

\set w1 '''bbbbbbbb-0000-0000-0000-000000000001'''
\set w2 '''bbbbbbbb-0000-0000-0000-000000000002'''
\set w3 '''bbbbbbbb-0000-0000-0000-000000000003'''
\set w4 '''bbbbbbbb-0000-0000-0000-000000000004'''

insert into auth.users (id, email) values
  (:mom, 'mom@example.com'), (:dad, 'dad@example.com'), (:solo, 'solo@example.com'), (:outsider, 'outsider@example.com');

-- 家族(グループ)と子どもは、あさノートの画面で作られている前提で、直接用意する。
insert into groups (id, name, created_by) values ('cccccccc-0000-0000-0000-00000000000a', '家族A', :mom), ('cccccccc-0000-0000-0000-00000000000b', '家族B', :outsider);
insert into group_members (group_id, user_id) values
  ('cccccccc-0000-0000-0000-00000000000a', :mom), ('cccccccc-0000-0000-0000-00000000000a', :dad),
  ('cccccccc-0000-0000-0000-00000000000b', :outsider);
insert into children (id, created_by, name) values
  (:hana, :mom, 'はな'), (:sota, :dad, 'そうた'), (:yui, :solo, 'ゆい'), (:ken, :outsider, 'けん');

\set as_anon     'reset role; select set_config(''request.jwt.claim.sub'', '''', true); set local role anon;'
\set as_mom      'reset role; select set_config(''request.jwt.claim.sub'', ' :mom ', true); set local role authenticated;'
\set as_dad      'reset role; select set_config(''request.jwt.claim.sub'', ' :dad ', true); set local role authenticated;'
\set as_solo     'reset role; select set_config(''request.jwt.claim.sub'', ' :solo ', true); set local role authenticated;'
\set as_outsider 'reset role; select set_config(''request.jwt.claim.sub'', ' :outsider ', true); set local role authenticated;'
\set as_postgres 'reset role; select set_config(''request.jwt.claim.sub'', '''', true);'

\set QUIET 0
\pset tuples_only on
\pset format unaligned
\o /dev/null

-- =====================================================================
-- 1. 共通表 children(誕生日・家族による更新・列の権限)
-- =====================================================================
:as_dad
select sk_test.eq('パパは、ママが登録した子どもの誕生日を入れられる(家族の誰でも更新できる)',
  sk_test.count($$update children set birth_date = '2021-08-20' where name = 'はな' returning 1$$), 1::bigint);
select sk_test.eq('パパは、ママが登録した子どもの名前を直せる',
  sk_test.count($$update children set name = 'はなちゃん' where name = 'はな' returning 1$$), 1::bigint);
select sk_test.raises('登録した人(created_by)は書き換えられない(列の権限)',
  format($$update children set created_by = %L where name = 'はなちゃん'$$, :dad), 'permission denied');
select sk_test.denied('パパは、ママが登録した子どもを削除できない(削除は登録した人だけ)', $$delete from children where name = 'はなちゃん' returning 1$$);

:as_outsider
select sk_test.denied('別の家族の人は、子どもを更新できない', $$update children set name = 'x' where name = 'はなちゃん' returning 1$$);
select sk_test.eq('別の家族の人から、家族Aの子どもは見えない', sk_test.count($$select * from children where created_by in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')$$), 0::bigint);

:as_mom
select sk_test.eq('ママからも誕生日が見える', (select birth_date::text from children where id = 'aaaaaaaa-0000-0000-0000-000000000001'), '2021-08-20');

-- =====================================================================
-- 2. 子どもごとの設定(館の名前)
-- =====================================================================
:as_mom
select sk_test.eq('ママは、はなの館の名前を設定できる',
  sk_test.count($$insert into sakuhin_child_settings (child_id, museum_name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'はなちゃん美術館') returning 1$$), 1::bigint);

:as_dad
select sk_test.eq('パパから、はなの館の名前が見える', sk_test.count('select * from sakuhin_child_settings'), 1::bigint);
select sk_test.eq('パパは館の名前を直せる',
  sk_test.count($$update sakuhin_child_settings set museum_name = 'HANA MUSEUM' returning 1$$), 1::bigint);
select sk_test.raises('設定の子ども(child_id)は付け替えられない(列の権限)',
  $$update sakuhin_child_settings set child_id = 'aaaaaaaa-0000-0000-0000-000000000002'$$, 'permission denied');
select sk_test.raises('館の名前は30文字まで', $$update sakuhin_child_settings set museum_name = repeat('あ', 31)$$, 'museum_name_check');

:as_outsider
select sk_test.eq('別の家族の人から、館の名前は見えない', sk_test.count('select * from sakuhin_child_settings'), 0::bigint);
select sk_test.raises('別の家族の子どもに、設定を作れない',
  $$insert into sakuhin_child_settings (child_id) values ('aaaaaaaa-0000-0000-0000-000000000002')$$, 'row-level security');

-- =====================================================================
-- 3. 作品の収蔵(insert)
-- =====================================================================
:as_mom
select sk_test.eq('ママは、はなの作品を収蔵できる',
  sk_test.count($$insert into sakuhin_works (id, child_id, made_on, title, kind, image_path, thumb_path, width, height)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-11-20', 'ママとうさぎ', 'drawing',
            '11111111-1111-1111-1111-111111111111/bbbbbbbb-0000-0000-0000-000000000001.jpg',
            '11111111-1111-1111-1111-111111111111/bbbbbbbb-0000-0000-0000-000000000001_thumb.jpg', 1200, 1640) returning 1$$), 1::bigint);
select sk_test.eq('収蔵した人(created_by)は、サーバーが自分にする', (select created_by::text from sakuhin_works where id = 'bbbbbbbb-0000-0000-0000-000000000001'), '11111111-1111-1111-1111-111111111111');
select sk_test.raises('同じ id の作品は二重に収蔵できない(再試行しても1件)',
  $$insert into sakuhin_works (id, child_id, made_on, image_path, thumb_path, width, height)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-11-20',
            '11111111-1111-1111-1111-111111111111/bbbbbbbb-0000-0000-0000-000000000001.jpg',
            '11111111-1111-1111-1111-111111111111/bbbbbbbb-0000-0000-0000-000000000001_thumb.jpg', 10, 10)$$, 'sakuhin_works_pkey');
select sk_test.raises('写真の置き場所は「自分の id/作品の id.jpg」に限る(ほかの人の写真を指せない)',
  $$insert into sakuhin_works (id, child_id, made_on, image_path, thumb_path, width, height)
    values ('bbbbbbbb-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-11-20',
            '22222222-2222-2222-2222-222222222222/bbbbbbbb-0000-0000-0000-000000000009.jpg',
            '11111111-1111-1111-1111-111111111111/bbbbbbbb-0000-0000-0000-000000000009_thumb.jpg', 10, 10)$$, 'image_path_check');
select sk_test.raises('ほかの人の名前で収蔵できない',
  $$insert into sakuhin_works (id, child_id, created_by, made_on, image_path, thumb_path, width, height)
    values ('bbbbbbbb-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '2026-11-20',
            '22222222-2222-2222-2222-222222222222/bbbbbbbb-0000-0000-0000-000000000008.jpg',
            '22222222-2222-2222-2222-222222222222/bbbbbbbb-0000-0000-0000-000000000008_thumb.jpg', 10, 10)$$, 'row-level security');
select sk_test.raises('種類は決まった値だけ', $$update sakuhin_works set kind = 'sculpture'$$, 'kind_check');
select sk_test.raises('タイトルは50文字まで', $$update sakuhin_works set title = repeat('あ', 51)$$, 'title_check');

:as_dad
select sk_test.eq('パパは、自分が登録した子ども(そうた)の作品を収蔵できる',
  sk_test.count($$insert into sakuhin_works (id, child_id, made_on, title, kind, image_path, thumb_path, width, height)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', '2026-11-10', 'やま', 'calligraphy',
            '22222222-2222-2222-2222-222222222222/bbbbbbbb-0000-0000-0000-000000000002.jpg',
            '22222222-2222-2222-2222-222222222222/bbbbbbbb-0000-0000-0000-000000000002_thumb.jpg', 1100, 1500) returning 1$$), 1::bigint);

:as_outsider
select sk_test.raises('別の家族の子どもの作品は収蔵できない',
  $$insert into sakuhin_works (id, child_id, made_on, image_path, thumb_path, width, height)
    values ('bbbbbbbb-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', '2026-11-20',
            '44444444-4444-4444-4444-444444444444/bbbbbbbb-0000-0000-0000-000000000007.jpg',
            '44444444-4444-4444-4444-444444444444/bbbbbbbb-0000-0000-0000-000000000007_thumb.jpg', 10, 10)$$, 'row-level security');
select sk_test.eq('別の家族の人は、自分の子ども(けん)の作品を収蔵できる',
  sk_test.count($$insert into sakuhin_works (id, child_id, made_on, image_path, thumb_path, width, height)
    values ('bbbbbbbb-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000004', '2026-10-01',
            '44444444-4444-4444-4444-444444444444/bbbbbbbb-0000-0000-0000-000000000004.jpg',
            '44444444-4444-4444-4444-444444444444/bbbbbbbb-0000-0000-0000-000000000004_thumb.jpg', 800, 600) returning 1$$), 1::bigint);

:as_solo
select sk_test.eq('グループに属さない人も、自分の子どもの作品を収蔵できる',
  sk_test.count($$insert into sakuhin_works (id, child_id, made_on, image_path, thumb_path, width, height)
    values ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000003', '2026-09-12',
            '33333333-3333-3333-3333-333333333333/bbbbbbbb-0000-0000-0000-000000000003.jpg',
            '33333333-3333-3333-3333-333333333333/bbbbbbbb-0000-0000-0000-000000000003_thumb.jpg', 800, 600) returning 1$$), 1::bigint);
select sk_test.eq('グループに属さない人には、自分の作品だけが見える', sk_test.count('select * from sakuhin_works'), 1::bigint);

-- =====================================================================
-- 4. 作品の見え方・更新
-- =====================================================================
:as_postgres
update sakuhin_works set updated_at = '2000-01-01';

:as_mom
select sk_test.eq('ママには、家族Aの作品(はな・そうた)が見える', sk_test.count('select * from sakuhin_works'), 2::bigint);

:as_dad
select sk_test.eq('パパにも、家族Aの作品が見える', sk_test.count('select * from sakuhin_works'), 2::bigint);
select sk_test.eq('パパは、ママが収蔵した作品のタイトル・常設展・実物保管を直せる',
  sk_test.count($$update sakuhin_works set title = 'ママとうさぎさん', is_featured = true, keep_original = true where id = 'bbbbbbbb-0000-0000-0000-000000000001' returning 1$$), 1::bigint);
select sk_test.eq('更新日時はサーバーが付ける', (select updated_at = now() from sakuhin_works where id = 'bbbbbbbb-0000-0000-0000-000000000001'), true);
select sk_test.raises('写真の置き場所は直せない(列の権限)',
  $$update sakuhin_works set image_path = 'x.jpg' where id = 'bbbbbbbb-0000-0000-0000-000000000001'$$, 'permission denied');
select sk_test.raises('収蔵した人は直せない(列の権限)',
  $$update sakuhin_works set created_by = '22222222-2222-2222-2222-222222222222' where id = 'bbbbbbbb-0000-0000-0000-000000000001'$$, 'permission denied');
select sk_test.eq('作者(子ども)を、家族の別の子どもへ直せる',
  sk_test.count($$update sakuhin_works set child_id = 'aaaaaaaa-0000-0000-0000-000000000002' where id = 'bbbbbbbb-0000-0000-0000-000000000001' returning 1$$), 1::bigint);
select sk_test.raises('作者(子ども)を、別の家族の子どもへは直せない',
  $$update sakuhin_works set child_id = 'aaaaaaaa-0000-0000-0000-000000000004' where id = 'bbbbbbbb-0000-0000-0000-000000000001'$$, 'row-level security');
update sakuhin_works set child_id = 'aaaaaaaa-0000-0000-0000-000000000001' where id = 'bbbbbbbb-0000-0000-0000-000000000001';

:as_outsider
select sk_test.eq('別の家族の人からは、家族Aの作品が見えない', sk_test.count($$select * from sakuhin_works where child_id <> 'aaaaaaaa-0000-0000-0000-000000000004'$$), 0::bigint);
select sk_test.denied('別の家族の人は、家族Aの作品を更新できない', $$update sakuhin_works set title = 'x' where id = 'bbbbbbbb-0000-0000-0000-000000000001' returning 1$$);
select sk_test.denied('別の家族の人は、家族Aの作品を削除できない', $$delete from sakuhin_works where id = 'bbbbbbbb-0000-0000-0000-000000000001' returning 1$$);

:as_anon
select sk_test.denied('未ログインは作品を読めない', 'select * from sakuhin_works');
select sk_test.denied('未ログインは設定を読めない', 'select * from sakuhin_child_settings');

-- =====================================================================
-- 5. 写真(Storage)
-- =====================================================================
:as_mom
select sk_test.ok('ママは、自分のフォルダへ写真を送れる',
  $$insert into storage.objects (bucket_id, name) values
    ('sakuhin-works', '11111111-1111-1111-1111-111111111111/bbbbbbbb-0000-0000-0000-000000000001.jpg'),
    ('sakuhin-works', '11111111-1111-1111-1111-111111111111/bbbbbbbb-0000-0000-0000-000000000001_thumb.jpg'),
    ('sakuhin-works', '11111111-1111-1111-1111-111111111111/unused.jpg')$$);
select sk_test.raises('ほかの人のフォルダへは送れない',
  $$insert into storage.objects (bucket_id, name) values ('sakuhin-works', '22222222-2222-2222-2222-222222222222/x.jpg')$$, 'row-level security');

:as_dad
select sk_test.ok('パパも、自分のフォルダへ写真を送れる',
  $$insert into storage.objects (bucket_id, name) values
    ('sakuhin-works', '22222222-2222-2222-2222-222222222222/bbbbbbbb-0000-0000-0000-000000000002.jpg'),
    ('sakuhin-works', '22222222-2222-2222-2222-222222222222/bbbbbbbb-0000-0000-0000-000000000002_thumb.jpg')$$);
select sk_test.eq('パパには、家族Aの作品が使う写真が見える(ママが送ったものも)', sk_test.count($$select * from storage.objects where bucket_id = 'sakuhin-works'$$), 4::bigint);
select sk_test.denied('パパは、ママのフォルダの使われていない写真を消せない',
  $$delete from storage.objects where name = '11111111-1111-1111-1111-111111111111/unused.jpg' returning 1$$);

:as_outsider
select sk_test.eq('別の家族の人からは、家族Aの写真が見えない', sk_test.count($$select * from storage.objects where bucket_id = 'sakuhin-works'$$), 0::bigint);
select sk_test.denied('別の家族の人は、家族Aの写真を消せない', $$delete from storage.objects where bucket_id = 'sakuhin-works' returning 1$$);

:as_anon
select sk_test.denied('未ログインは写真を読めない', $$select * from storage.objects where bucket_id = 'sakuhin-works'$$);

:as_mom
select sk_test.eq('収蔵に失敗したときの後始末: 自分のフォルダの、使われていない写真は消せる',
  sk_test.count($$delete from storage.objects where name = '11111111-1111-1111-1111-111111111111/unused.jpg' returning 1$$), 1::bigint);
select sk_test.eq('ママは、パパが送った写真でも、見られる作品のものなら消せる(作品の削除のとき)',
  sk_test.count($$delete from storage.objects where name = '22222222-2222-2222-2222-222222222222/bbbbbbbb-0000-0000-0000-000000000002_thumb.jpg' returning 1$$), 1::bigint);

-- =====================================================================
-- 6. 作品がある子どもは、画面から削除できない(退会の連鎖は止めない)
-- =====================================================================
:as_mom
select sk_test.raises('作品がある子どもは削除できない(あさノート・よるノートの画面から)',
  $$delete from children where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$, 'sakuhin_child_has_works');
insert into children (id, created_by, name) values ('aaaaaaaa-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'さくひんなし');
select sk_test.eq('作品が無い子どもは、これまでどおり削除できる',
  sk_test.count($$delete from children where id = 'aaaaaaaa-0000-0000-0000-000000000005' returning 1$$), 1::bigint);

-- =====================================================================
-- 7. 家族を抜けた人
-- =====================================================================
:as_mom
select sk_test.eq('ママが家族を抜ける', sk_test.count('delete from group_members where user_id = auth.uid() returning 1'), 1::bigint);
select sk_test.eq('抜けた人からは、家族の作品が見えない(子どもは残る家族へ移る)', sk_test.count('select * from sakuhin_works'), 0::bigint);
select sk_test.denied('抜けた人は、自分のフォルダにあっても、家族の作品が使う写真を消せない',
  $$delete from storage.objects where name = '11111111-1111-1111-1111-111111111111/bbbbbbbb-0000-0000-0000-000000000001.jpg' returning 1$$);

:as_dad
select sk_test.eq('残った家族には、抜けた人が収蔵した作品も残る', sk_test.count($$select * from sakuhin_works where id = 'bbbbbbbb-0000-0000-0000-000000000001'$$), 1::bigint);
select sk_test.eq('残った家族には、その写真も見える', sk_test.count($$select * from storage.objects where name = '11111111-1111-1111-1111-111111111111/bbbbbbbb-0000-0000-0000-000000000001.jpg'$$), 1::bigint);
select sk_test.eq('子どもを削除できなくても、作品は消せる(作品を消した後なら子どもを削除できる)',
  sk_test.count($$delete from sakuhin_works where id = 'bbbbbbbb-0000-0000-0000-000000000002' returning 1$$), 1::bigint);
select sk_test.eq('作品が無くなった子どもは削除できる',
  sk_test.count($$delete from children where id = 'aaaaaaaa-0000-0000-0000-000000000002' returning 1$$), 1::bigint);

-- =====================================================================
-- 8. 退会(アカウントの削除。service role のため auth.uid() が無い)
-- =====================================================================
:as_postgres
delete from auth.users where id = :solo;
select sk_test.eq('ひとりで使っていた人が退会すると、子どもと作品も消える(連鎖を止めない)',
  (select count(*) from sakuhin_works where id = 'bbbbbbbb-0000-0000-0000-000000000003'), 0::bigint);
delete from auth.users where id = :mom;
select sk_test.eq('家族に作品を残して退会しても、作品は家族に残る(収蔵した人は空になる)',
  (select created_by is null from sakuhin_works where id = 'bbbbbbbb-0000-0000-0000-000000000001'), true);

\o
\echo 'sakuhin RLS tests: all passed'
rollback;
