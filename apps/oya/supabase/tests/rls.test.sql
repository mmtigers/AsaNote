-- おやノートの権限(RLS・RPC)のテスト。素の Postgres で実行する(scripts/test-db.sh、CI の ci-oya.yml)。
--
-- 前提: supabase/ci/supabase-stub.sql と supabase/schema.sql を適用済みの DB。
-- 全体を1つのトランザクションで実行し、最後に rollback する(DB に何も残さない)。
-- 利用者の切り替えは、PostgREST と同じく「JWT の sub を設定して authenticated ロールになる」ことで再現する
-- (下の :as_xxx)。失敗すると FAIL: ... の例外で止まる(psql -v ON_ERROR_STOP=1 で実行すること)。
--
-- 登場人物
--   家族1: 管理者(admin) / 父・母(parent) / 長男(viewer)
--   家族2: 管理者2(admin) / 祖父(parent)   … 写真が無い家族。家族1とのデータ分離の確認にも使う
--   部外者(outsider): どの家族にも属さないログイン済みアカウント
--   未ログイン(anon)

\set ON_ERROR_STOP 1
\set QUIET 1
set client_min_messages = notice;

begin;

-- ---------------------------------------------------------------------
-- テスト用の補助(トランザクションごと消える)
-- ---------------------------------------------------------------------
create schema oya_test;
grant usage on schema oya_test to anon, authenticated;

create function oya_test.eq(label text, actual anyelement, expected anyelement) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL: % (expected %, got %)', label, expected, actual;
  end if;
  raise notice 'ok: %', label;
end $$;

-- select でも、returning 付きの insert / update / delete でも、行数を返す。
create function oya_test.count(sql text) returns bigint
language plpgsql as $$
declare
  n bigint;
begin
  execute 'with t as (' || sql || ') select count(*) from t' into n;
  return n;
end $$;

create function oya_test.raises(label text, sql text, pattern text) returns void
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

-- 結果を受け渡すための一時表(テストの補助なので RLS の対象外)。
create table oya_test.vars (key text primary key, value text);
grant all on oya_test.vars to anon, authenticated;

create function oya_test.set_var(k text, v text) returns void
language sql as $$ insert into oya_test.vars values (k, v) on conflict (key) do update set value = excluded.value $$;
create function oya_test.var(k text) returns text
language sql as $$ select value from oya_test.vars where key = k $$;

\set father   '''11111111-1111-1111-1111-111111111111'''
\set mother   '''22222222-2222-2222-2222-222222222222'''
\set admin    '''33333333-3333-3333-3333-333333333333'''
\set viewer   '''44444444-4444-4444-4444-444444444444'''
\set outsider '''55555555-5555-5555-5555-555555555555'''
\set admin2   '''66666666-6666-6666-6666-666666666666'''
\set grandpa  '''77777777-7777-7777-7777-777777777777'''

insert into auth.users (id, email) values
  (:father, 'father@example.com'), (:mother, 'mother@example.com'), (:admin, 'admin@example.com'),
  (:viewer, 'viewer@example.com'), (:outsider, 'outsider@example.com'), (:admin2, 'admin2@example.com'),
  (:grandpa, 'grandpa@example.com');

\set as_anon     'reset role; select set_config(''request.jwt.claim.sub'', '''', true); set local role anon;'
\set as_father   'reset role; select set_config(''request.jwt.claim.sub'', ' :father ', true); set local role authenticated;'
\set as_mother   'reset role; select set_config(''request.jwt.claim.sub'', ' :mother ', true); set local role authenticated;'
\set as_admin    'reset role; select set_config(''request.jwt.claim.sub'', ' :admin ', true); set local role authenticated;'
\set as_viewer   'reset role; select set_config(''request.jwt.claim.sub'', ' :viewer ', true); set local role authenticated;'
\set as_outsider 'reset role; select set_config(''request.jwt.claim.sub'', ' :outsider ', true); set local role authenticated;'
\set as_admin2   'reset role; select set_config(''request.jwt.claim.sub'', ' :admin2 ', true); set local role authenticated;'
\set as_grandpa  'reset role; select set_config(''request.jwt.claim.sub'', ' :grandpa ', true); set local role authenticated;'
\set as_postgres 'reset role; select set_config(''request.jwt.claim.sub'', '''', true);'

\set QUIET 0
\pset tuples_only on
\pset format unaligned
\o /dev/null

-- =====================================================================
-- 1. 家族の作成と招待
-- =====================================================================
:as_anon
select oya_test.raises('未ログインは家族を作れない', $$select create_oya_family('管理者')$$, 'permission denied|not_authenticated');

:as_admin
select oya_test.set_var('family1', create_oya_family('管理者', '実家')::text);
select oya_test.raises('家族に属している人は、もう1つ家族を作れない', $$select create_oya_family('管理者')$$, 'already_in_family');
select oya_test.eq('管理者の役割は admin', oya_my_role(), 'admin');
select oya_test.set_var('code_father', create_oya_invite('parent', '父'));
select oya_test.set_var('code_mother', create_oya_invite('parent', '母'));
select oya_test.set_var('code_viewer', create_oya_invite('viewer', '長男'));
select oya_test.set_var('code_expired', create_oya_invite('parent', '期限切れ'));
select oya_test.eq('招待コードは紛らわしい文字(0/O/1/I)を含まない8桁', oya_test.var('code_father') ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$', true);
select oya_test.raises('招待の役割は parent / admin / viewer だけ', $$select create_oya_invite('owner', '誰か')$$, 'oya_invites_role_check');
select oya_test.eq('管理者は自分の家族の招待コードを読める', oya_test.count('select * from oya_invites'), 4::bigint);

:as_postgres
update oya_invites set expires_at = now() - interval '1 minute' where code = oya_test.var('code_expired');

:as_father
select oya_test.eq('父は招待コードで参加する', redeem_oya_invite(lower(oya_test.var('code_father'))), oya_test.var('family1')::uuid);
select oya_test.eq('父の役割は parent(発行時に決めた役割)', oya_my_role(), 'parent');
select oya_test.raises('親は招待コードを発行できない', $$select create_oya_invite('viewer', '誰か')$$, 'not_admin');
select oya_test.eq('親は招待コードを読めない', oya_test.count('select * from oya_invites'), 0::bigint);

:as_mother
select oya_test.raises('使用済みの招待コードは使えない', $$select redeem_oya_invite(oya_test.var('code_father'))$$, 'invite_invalid');
select oya_test.raises('期限切れの招待コードは使えない', $$select redeem_oya_invite(oya_test.var('code_expired'))$$, 'invite_invalid');
select redeem_oya_invite(oya_test.var('code_mother'));

:as_viewer
select redeem_oya_invite(oya_test.var('code_viewer'));
select oya_test.raises('閲覧者は招待コードを発行できない', $$select create_oya_invite('viewer', '誰か')$$, 'not_admin');

:as_admin2
select oya_test.set_var('family2', create_oya_family('管理者2')::text);
select oya_test.set_var('code_grandpa', create_oya_invite('parent', '祖父'));

:as_grandpa
select redeem_oya_invite(oya_test.var('code_grandpa'));

:as_father
select oya_test.raises('家族に属している人は、別の家族の招待コードを使えない', $$select redeem_oya_invite('XXXXXXXX')$$, 'invite_invalid');

-- =====================================================================
-- 2. メンバー・家族の見え方
-- =====================================================================
:as_father
select oya_test.eq('親は同じ家族のメンバー(表示名)を読める', oya_test.count('select * from oya_members'), 4::bigint);
select oya_test.eq('親から見える家族は自分の家族だけ', oya_test.count('select * from oya_families'), 1::bigint);

:as_admin2
select oya_test.eq('別の家族の管理者からは、家族1のメンバーが見えない', oya_test.count('select * from oya_members where family_id = ' || quote_literal(oya_test.var('family1'))), 0::bigint);

:as_outsider
select oya_test.eq('部外者からはメンバーが見えない', oya_test.count('select * from oya_members'), 0::bigint);
select oya_test.eq('部外者からは家族が見えない', oya_test.count('select * from oya_families'), 0::bigint);
select oya_test.eq('部外者からは招待コードが見えない', oya_test.count('select * from oya_invites'), 0::bigint);

:as_anon
select oya_test.eq('未ログインからはメンバーが見えない', oya_test.count('select * from oya_members'), 0::bigint);

:as_admin
select oya_test.raises('メンバーを直接追加できない(RPC だけ)', format($$insert into oya_members (family_id, user_id, role, display_name) values (%L, %L, 'admin', '乗っ取り')$$, oya_test.var('family1'), :outsider), 'row-level security');

:as_father
select oya_test.eq('親は自分の役割を直接書き換えられない(0件)', oya_test.count($$update oya_members set role = 'admin' where user_id = auth.uid() returning 1$$), 0::bigint);

-- =====================================================================
-- 3. 記録の作成・重複・日付・保護される列
-- =====================================================================
:as_father
select oya_test.eq('父は今日の記録を作れる(family_id はサーバーが入れる)',
  oya_test.count($$insert into oya_records (record_date, breakfast, medication, went_out, memo) values (oya_today_jst(), 'ate', 'taken', false, '父のメモ') returning 1$$), 1::bigint);
select oya_test.eq('family_id は父の家族', (select family_id::text from oya_records where user_id = auth.uid()), oya_test.var('family1'));
select oya_test.eq('未入力の項目は null のまま(「しなかった」と区別)', (select lunch is null and shopping is null and went_out = false from oya_records where user_id = auth.uid()), true);
select oya_test.raises('同じ日付の記録は重複して作れない', $$insert into oya_records (record_date) values (oya_today_jst())$$, 'oya_records_user_id_record_date_key');
select oya_test.eq('upsert(on conflict)で同じ日付の記録を更新できる',
  oya_test.count($$insert into oya_records (record_date, lunch) values (oya_today_jst(), 'little') on conflict (user_id, record_date) do update set lunch = excluded.lunch returning 1$$), 1::bigint);
select oya_test.eq('upsert の後も1件', oya_test.count('select * from oya_records where user_id = auth.uid()'), 1::bigint);
select oya_test.raises('未来の日付(日本時間の明日)は記録できない', $$insert into oya_records (record_date) values (oya_today_jst() + 1)$$, 'future_date');
select oya_test.eq('過去の日付は制限なく記録できる', oya_test.count($$insert into oya_records (record_date) values (oya_today_jst() - 400) returning 1$$), 1::bigint);
insert into oya_records (record_date, completed_at) values (oya_today_jst() - 3, now());
select oya_test.eq('クライアントは completed_at を入れられない(insert)', (select completed_at is null from oya_records where record_date = oya_today_jst() - 3), true);
select oya_test.raises('食事は決まった値だけ', $$insert into oya_records (record_date, dinner) values (oya_today_jst() - 5, 'lots')$$, 'oya_records_dinner_check');
select oya_test.raises('メモは2000文字まで', $$insert into oya_records (record_date, memo) values (oya_today_jst() - 6, repeat('あ', 2001))$$, 'oya_records_memo_check');
update oya_records set record_date = oya_today_jst() - 10, user_id = :mother where record_date = oya_today_jst();
select oya_test.eq('日付と持ち主は更新で変えられない', oya_test.count('select * from oya_records where user_id = auth.uid() and record_date = oya_today_jst()'), 1::bigint);
select oya_test.eq('親は自分の記録を削除できない(記録は削除しない)', oya_test.count('delete from oya_records returning 1'), 0::bigint);

:as_mother
select oya_test.eq('母は自分の今日の記録を作れる', oya_test.count($$insert into oya_records (record_date, breakfast, memo) values (oya_today_jst(), 'none', '母のメモ') returning 1$$), 1::bigint);
select oya_test.raises('母は父の名前で記録を作れない', format($$insert into oya_records (user_id, record_date) values (%L, oya_today_jst() - 1)$$, :father), 'row-level security');

-- =====================================================================
-- 4. 父母の分離と、家族の閲覧
-- =====================================================================
:as_mother
select oya_test.eq('母からは父の記録が見えない', oya_test.count(format('select * from oya_records where user_id = %L', :father)), 0::bigint);
select oya_test.eq('母から見える記録は自分の分だけ', oya_test.count('select * from oya_records'), 1::bigint);
select oya_test.eq('母は父の記録を更新できない(0件)', oya_test.count(format($$update oya_records set memo = '書き換え' where user_id = %L returning 1$$, :father)), 0::bigint);

:as_father
select oya_test.eq('父からは母の記録が見えない', oya_test.count(format('select * from oya_records where user_id = %L', :mother)), 0::bigint);
select oya_test.eq('父のメモは書き換えられていない', (select memo from oya_records where record_date = oya_today_jst()), '父のメモ');

:as_admin
select oya_test.eq('管理者は父母の記録を両方読める', oya_test.count('select distinct user_id from oya_records'), 2::bigint);
select oya_test.raises('管理者は記録を作れない(代理入力しない)', $$insert into oya_records (record_date) values (oya_today_jst())$$, 'not_a_parent');
select oya_test.eq('管理者は親の記録を更新できない(0件)', oya_test.count($$update oya_records set memo = '代理' returning 1$$), 0::bigint);

:as_viewer
select oya_test.eq('閲覧者は父母の記録を両方読める', oya_test.count('select distinct user_id from oya_records'), 2::bigint);
select oya_test.raises('閲覧者は記録を作れない', $$insert into oya_records (record_date) values (oya_today_jst())$$, 'not_a_parent');
select oya_test.eq('閲覧者は親の記録を更新できない(0件)', oya_test.count($$update oya_records set memo = '閲覧者' returning 1$$), 0::bigint);

:as_admin2
select oya_test.eq('別の家族の管理者からは、家族1の記録が見えない', oya_test.count(format('select * from oya_records where family_id = %L', oya_test.var('family1'))), 0::bigint);

:as_grandpa
select oya_test.eq('別の家族の親からは、家族1の記録が見えない', oya_test.count('select * from oya_records'), 0::bigint);

:as_outsider
select oya_test.eq('部外者からは記録が見えない', oya_test.count('select * from oya_records'), 0::bigint);
select oya_test.raises('部外者は記録を作れない', $$insert into oya_records (record_date) values (oya_today_jst())$$, 'not_a_parent');

:as_anon
select oya_test.eq('未ログインからは記録が見えない', oya_test.count('select * from oya_records'), 0::bigint);

-- =====================================================================
-- 5. 写真の管理(家族管理者だけ)と Storage
-- =====================================================================
:as_postgres
select oya_test.set_var('photo_a', 'aaaaaaaa-0000-0000-0000-000000000001');
select oya_test.set_var('photo_b', 'aaaaaaaa-0000-0000-0000-000000000002');
select oya_test.set_var('photo_c', 'aaaaaaaa-0000-0000-0000-000000000003');

:as_admin
select oya_test.eq('管理者は自分の家族のフォルダへ写真をアップロードできる',
  oya_test.count(format($$insert into storage.objects (bucket_id, name) values
    ('grandchild-photos', %1$L || '/' || %2$L || '.jpg'), ('grandchild-photos', %1$L || '/' || %3$L || '.jpg'), ('grandchild-photos', %1$L || '/' || %4$L || '.jpg') returning 1$$,
    oya_test.var('family1'), oya_test.var('photo_a'), oya_test.var('photo_b'), oya_test.var('photo_c'))), 3::bigint);
select oya_test.eq('管理者は写真を登録できる',
  oya_test.count(format($$insert into oya_photos (id, family_id, storage_path) values
    (%2$L, %1$L, %1$L || '/' || %2$L || '.jpg'), (%3$L, %1$L, %1$L || '/' || %3$L || '.jpg'), (%4$L, %1$L, %1$L || '/' || %4$L || '.jpg') returning 1$$,
    oya_test.var('family1'), oya_test.var('photo_a'), oya_test.var('photo_b'), oya_test.var('photo_c'))), 3::bigint);
select oya_test.eq('created_by は登録した管理者', (select count(*) from oya_photos where created_by = auth.uid()), 3::bigint);
select oya_test.raises('写真のパスは {family_id}/{id}.jpg の形だけ',
  format($$insert into oya_photos (family_id, storage_path) values (%L, 'other/path.jpg')$$, oya_test.var('family1')), 'oya_photos_check');
select oya_test.raises('別の家族のフォルダへはアップロードできない',
  format($$insert into storage.objects (bucket_id, name) values ('grandchild-photos', %L || '/x.jpg')$$, oya_test.var('family2')), 'row-level security');
select oya_test.raises('別の家族の写真は登録できない',
  format($$insert into oya_photos (id, family_id, storage_path) values ('bbbbbbbb-0000-0000-0000-000000000001', %1$L, %1$L || '/bbbbbbbb-0000-0000-0000-000000000001.jpg')$$, oya_test.var('family2')), 'row-level security');
update oya_photos set storage_path = 'x/y.jpg', family_id = oya_test.var('family2')::uuid where id = oya_test.var('photo_a')::uuid;
select oya_test.eq('写真の家族とパスは更新で変えられない', (select storage_path from oya_photos where id = oya_test.var('photo_a')::uuid), oya_test.var('family1') || '/' || oya_test.var('photo_a') || '.jpg');

:as_viewer
select oya_test.eq('閲覧者は家族の写真を読める', oya_test.count('select * from oya_photos'), 3::bigint);
select oya_test.eq('閲覧者は家族の写真のファイルを読める', oya_test.count($$select * from storage.objects where bucket_id = 'grandchild-photos'$$), 3::bigint);
select oya_test.raises('閲覧者は写真をアップロードできない',
  format($$insert into storage.objects (bucket_id, name) values ('grandchild-photos', %L || '/v.jpg')$$, oya_test.var('family1')), 'row-level security');
select oya_test.raises('閲覧者は写真を登録できない',
  format($$insert into oya_photos (id, family_id, storage_path) values ('cccccccc-0000-0000-0000-000000000001', %1$L, %1$L || '/cccccccc-0000-0000-0000-000000000001.jpg')$$, oya_test.var('family1')), 'row-level security');
select oya_test.eq('閲覧者は写真を無効化できない(0件)', oya_test.count('update oya_photos set active = false returning 1'), 0::bigint);
select oya_test.eq('閲覧者は写真を削除できない(0件)', oya_test.count('delete from oya_photos returning 1'), 0::bigint);
select oya_test.eq('閲覧者は写真のファイルを削除できない(0件)', oya_test.count('delete from storage.objects returning 1'), 0::bigint);

:as_father
select oya_test.eq('親は、表示される前の写真を読めない', oya_test.count('select * from oya_photos'), 0::bigint);
select oya_test.eq('親は、表示される前の写真のファイルを読めない', oya_test.count('select * from storage.objects'), 0::bigint);
select oya_test.eq('親は写真を削除できない(0件)', oya_test.count('delete from storage.objects returning 1'), 0::bigint);
select oya_test.raises('親は表示の履歴を直接作れない',
  format($$insert into oya_photo_reveals (user_id, record_date, photo_id) values (auth.uid(), oya_today_jst() - 20, %L)$$, oya_test.var('photo_a')), 'row-level security');

:as_admin2
select oya_test.eq('別の家族の管理者からは、家族1の写真が見えない', oya_test.count('select * from oya_photos'), 0::bigint);
select oya_test.eq('別の家族の管理者からは、家族1の写真のファイルが見えない', oya_test.count('select * from storage.objects'), 0::bigint);

:as_outsider
select oya_test.eq('部外者からは写真が見えない', oya_test.count('select * from oya_photos'), 0::bigint);
select oya_test.eq('部外者からは写真のファイルが見えない', oya_test.count('select * from storage.objects'), 0::bigint);

:as_anon
select oya_test.eq('未ログインからは写真のファイルが見えない', oya_test.count('select * from storage.objects'), 0::bigint);

-- =====================================================================
-- 6. 完了と写真の表示
-- =====================================================================
:as_father
select oya_test.raises('記録が無い日は完了できない', $$select * from complete_oya_record(oya_today_jst() - 30)$$, 'record_not_found');
select oya_test.set_var('father_today_photo', (select photo_id::text from complete_oya_record(oya_today_jst())));
select oya_test.eq('完了すると、家族の写真が1枚選ばれる', oya_test.var('father_today_photo') in (oya_test.var('photo_a'), oya_test.var('photo_b'), oya_test.var('photo_c')), true);
select oya_test.eq('完了の時刻が入る', (select completed_at is not null from oya_records where record_date = oya_today_jst()), true);
select oya_test.eq('もう一度呼んでも同じ写真(再抽選しない)', (select photo_id::text from complete_oya_record(oya_today_jst())), oya_test.var('father_today_photo'));
select oya_test.eq('表示の履歴は1日1件', oya_test.count('select * from oya_photo_reveals'), 1::bigint);
select oya_test.eq('親は、表示された写真だけを読める', oya_test.count('select * from oya_photos'), 1::bigint);
select oya_test.eq('親は、表示された写真のファイルだけを読める', oya_test.count('select * from storage.objects'), 1::bigint);
select oya_test.set_var('father_completed_at', (select completed_at::text from oya_records where record_date = oya_today_jst()));
update oya_records set memo = '完了後に修正', completed_at = null where record_date = oya_today_jst();
select oya_test.eq('完了後に修正しても、完了状態は維持される', (select completed_at::text from oya_records where record_date = oya_today_jst()), oya_test.var('father_completed_at'));
select oya_test.eq('修正しても写真は増えない', (select photo_id::text from complete_oya_record(oya_today_jst())), oya_test.var('father_today_photo'));
select oya_test.eq('修正の後も表示の履歴は1件', oya_test.count('select * from oya_photo_reveals'), 1::bigint);

-- 直前と同じ写真が続かない(有効な写真が3枚あるので、毎回直前の1枚は候補から外れる)。
insert into oya_records (record_date) values (oya_today_jst() - 1), (oya_today_jst() - 2);
select oya_test.set_var('father_d2_photo', (select photo_id::text from complete_oya_record(oya_today_jst() - 2)));
select oya_test.set_var('father_d1_photo', (select photo_id::text from complete_oya_record(oya_today_jst() - 1)));
select oya_test.eq('直前と同じ写真は続かない(1)', oya_test.var('father_d1_photo') <> oya_test.var('father_d2_photo'), true);

:as_mother
select oya_test.eq('母からは父に表示された写真が見えない', oya_test.count('select * from oya_photos'), 0::bigint);
select oya_test.eq('母からは父に表示された写真のファイルが見えない', oya_test.count('select * from storage.objects'), 0::bigint);
select oya_test.eq('母からは父の表示の履歴が見えない', oya_test.count('select * from oya_photo_reveals'), 0::bigint);
select oya_test.eq('母の完了と写真は、父とは別に決まる', (select photo_id is not null from complete_oya_record(oya_today_jst())), true);
select oya_test.eq('母の表示の履歴は母の分だけ', oya_test.count('select * from oya_photo_reveals'), 1::bigint);

:as_admin
select oya_test.raises('管理者は記録を完了できない', $$select * from complete_oya_record(oya_today_jst())$$, 'not_a_parent');
select oya_test.eq('管理者からは親の表示の履歴が見えない', oya_test.count('select * from oya_photo_reveals'), 0::bigint);
-- 無効化した写真は、これからの抽選に使わない。有効な写真が1枚だけなら、直前と同じでもそれを使う。
update oya_photos set active = false where id <> oya_test.var('father_d1_photo')::uuid;

:as_father
insert into oya_records (record_date) values (oya_today_jst() - 3) on conflict (user_id, record_date) do nothing;
select oya_test.eq('有効な写真が1枚だけなら、直前と同じでもそれを使う', (select photo_id::text from complete_oya_record(oya_today_jst() - 3)), oya_test.var('father_d1_photo'));
select oya_test.eq('無効化された写真でも、表示済みなら親は見返せる', oya_test.count(format('select * from oya_photos where id = %L', oya_test.var('father_d2_photo'))), 1::bigint);

:as_admin
update oya_photos set active = false;

:as_father
insert into oya_records (record_date) values (oya_today_jst() - 4);
select oya_test.eq('有効な写真が無いときも完了できる(写真は返さない)', (select photo_id is null and completed_at is not null from complete_oya_record(oya_today_jst() - 4)), true);
select oya_test.eq('写真が無いときは、表示の履歴を作らない', oya_test.count('select * from oya_photo_reveals where record_date = oya_today_jst() - 4'), 0::bigint);

:as_admin
update oya_photos set active = true where id = oya_test.var('photo_c')::uuid;

:as_father
select oya_test.eq('写真が追加された後にもう一度呼ぶと、その日の写真が選ばれる', (select photo_id::text from complete_oya_record(oya_today_jst() - 4)), oya_test.var('photo_c'));

:as_admin
delete from oya_photos where id = oya_test.var('photo_c')::uuid;

:as_father
select oya_test.eq('写真が削除されると、その日の写真は返らない(再抽選しない)', (select photo_id is null from complete_oya_record(oya_today_jst() - 4)), true);

:as_grandpa
insert into oya_records (record_date, condition) values (oya_today_jst(), 'good');
select oya_test.eq('写真が1枚も無い家族でも完了できる', (select photo_id is null and completed_at is not null from complete_oya_record(oya_today_jst())), true);

:as_anon
select oya_test.raises('未ログインは完了できない', $$select * from complete_oya_record(oya_today_jst())$$, 'permission denied|not_authenticated');

-- =====================================================================
-- 7. メンバーの管理
-- =====================================================================
:as_viewer
select oya_test.raises('閲覧者は他のメンバーを外せない', format('select remove_oya_member(%L)', :father), 'not_admin');
select oya_test.raises('閲覧者は役割を変えられない', format($$select set_oya_member_role(%L, 'admin')$$, :viewer), 'not_admin');

:as_admin2
select oya_test.raises('別の家族の管理者は、家族1のメンバーを外せない', format('select remove_oya_member(%L)', :father), 'member_not_found');

:as_admin
select oya_test.raises('他のメンバーが残るのに、最後の管理者は抜けられない', format('select remove_oya_member(%L)', :admin), 'last_admin');
select oya_test.raises('最後の管理者は、自分を管理者以外にできない', format($$select set_oya_member_role(%L, 'viewer')$$, :admin), 'last_admin');
select set_oya_member_role(:viewer, 'admin');
select oya_test.eq('管理者は役割を変えられる', (select role from oya_members where user_id = :viewer), 'admin');
select set_oya_member_role(:viewer, 'viewer');
select remove_oya_member(:mother);
select oya_test.eq('管理者はメンバーを外せる', oya_test.count(format('select * from oya_members where user_id = %L', :mother)), 0::bigint);
select oya_test.eq('外れた親の記録は家族に残る(管理者は読める)', oya_test.count(format('select * from oya_records where user_id = %L', :mother)), 1::bigint);

:as_mother
select oya_test.eq('外れた親は自分の記録を読める', oya_test.count('select * from oya_records'), 1::bigint);
select oya_test.raises('外れた親は記録を作れない', $$insert into oya_records (record_date) values (oya_today_jst() - 1)$$, 'not_a_parent');
select oya_test.eq('外れた親は記録を更新できない(0件)', oya_test.count($$update oya_records set memo = 'x' returning 1$$), 0::bigint);
select oya_test.eq('外れた親からは家族のメンバーが見えない', oya_test.count('select * from oya_members'), 0::bigint);

:as_father
select remove_oya_member(:father);
select oya_test.eq('親は自分で家族から抜けられる', oya_my_family() is null, true);

-- =====================================================================
-- 8. アカウントの削除
-- =====================================================================
:as_postgres
delete from auth.users where id = :father;
select oya_test.eq('アカウントを削除すると、その人の記録が消える', (select count(*) from oya_records where user_id = :father), 0::bigint);
select oya_test.eq('アカウントを削除すると、その人の表示の履歴が消える', (select count(*) from oya_photo_reveals where user_id = :father), 0::bigint);

\o
\echo 'oya RLS tests: all passed'
rollback;
