# 実機での同期・共有の動作確認手順(Issue #12)

実機(スマホ)と Supabase の画面を使う確認です。上から順に進め、ダメだった項目は末尾の「切り分け」を見てください。
SQL は Supabase の SQL Editor で実行します(読み取りのみ)。

## 準備

- 記録を保存する端末(自分)と、見る端末(パートナー)の2台。両方ログイン済みにする。
- 確認用の記録は「テスト」とメモに書いておくと、あとで削除しやすい。

## 1. 「共有」タブにあさノートのグループ・子どもが出る

- アプリの「共有」タブを開く。
- 期待: あさノートで登録済みのグループと子どもが表示される。
- 出ない場合 → 切り分け A。

## 2. 記録を保存し「未同期」表示が消える

1. ホームで日付を選び、様子・時刻・メモ・写真1枚を入れて保存。
2. 画面上部に「未同期N件」が出る場合は、通信できる状態で数秒待つ(自動同期)。
3. 期待: 「未同期」の表示が消える。
- 消えない場合 → 切り分け B。

## 3. `evening_records` / `evening_photos` に行が増える

```sql
select id, user_id, child_id, record_date, outcome, left(memo, 20) as memo, updated_at
from evening_records order by updated_at desc limit 5;

select id, record_id, user_id, storage_path, created_at
from evening_photos order by created_at desc limit 5;
```

- 期待: 今保存した記録と写真の行がある。`child_id` が選んだ子どもの id になっている。

## 4. Storage `evening-photos` にファイルが入る

- Supabase の Storage → `evening-photos` → 自分の `user_id` のフォルダにファイルがある。
- SQL で見る場合:

```sql
select name, created_at from storage.objects
where bucket_id = 'evening-photos' order by created_at desc limit 5;
```

- 期待: `storage_path`(手順3)と同じパスのオブジェクトがある。

## 5. パートナー側の端末でも記録が見える(RLS)

- パートナーの端末で、同じ日付のタイムライン/ホームを開く(引っ張って更新、またはアプリ再起動)。
- 期待: 自分が保存した記録と写真が見える。パートナーは編集・削除できない(自分の記録のみ編集可)。
- 見えない場合 → 切り分け C。

## 6. ホーム画面に追加して起動できる

- iPhone: Safari で開く → 共有 → 「ホーム画面に追加」。Android: メニュー → 「ホーム画面に追加/アプリをインストール」。
- 期待: 追加したアイコン(藍色に月と星)から全画面で起動し、ログイン状態が保たれる。
- アイコンの見え方(切り抜きで月が欠けないか)もここで確認。好みに合わなければ `design/icon.svg` を直して `node scripts/generate-icons.mjs`。

## 切り分け

### A. 共有タブに何も出ない
- 自分が `group_members` に入っているか:
  ```sql
  select gm.group_id, gm.user_id, g.name from group_members gm join groups g on g.id = gm.group_id;
  select id, group_id, name from children;
  ```
- 行が無ければ、あさノート側でグループ参加ができていない(よるノートでは作らない設計)。あさノートで先に参加する。

### B. 「未同期」が消えない
- オフライン表示になっていないか。ブラウザの DevTools(PC で同じ URL を開き、Console を確認)で RLS エラー(`new row violates row-level security policy`)が出ていないか。
- `evening_*` のスキーマ(`supabase/schema.sql`)を SQL Editor で最新まで流しているか。特に写真は Storage のポリシーが無いと失敗する。
- 写真だけ残る場合は `storage.objects` のポリシー(`evening photos are uploadable by owner`)の有無を確認:
  ```sql
  select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'evening%';
  ```

### C. パートナー側で見えない
- 2人が同じグループにいるか:
  ```sql
  select group_id, user_id from group_members order by group_id;
  ```
- 記録の可視範囲ポリシーが入っているか:
  ```sql
  select tablename, policyname from pg_policies where tablename in ('evening_records', 'evening_photos') order by 1, 2;
  ```
- 同じ `group_id` に両者がいるのに見えない場合は、`policyname` が `... readable by owner or group members` になっているか確認。

## 結果の記録

確認できた項目は Issue #12 のチェックボックスにチェックを入れ、ダメだった項目は症状(画面の表示・エラー文言)を書いてください。それをもとに修正します。
