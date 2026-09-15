# あさノート 仕様書

子どもが登校を渋る朝のようすを、選ぶだけでサッと記録する家族向けメモアプリ。
本書はコード（`src/`・`supabase/schema.sql`）から起こした現状の仕様書であり、実装が正。
変更を加えたら本書も合わせて更新すること。

## 1. 目的・コンセプト

- 忙しい朝でも「タップするだけ」で今日の様子を記録できること。
- 記録の積み重ねから、子どもが登校しやすくなる傾向（良かった理由・気になる理由）を振り返れること。
- 夫婦・家族で記録を共有し、どちらが記録しても状況を把握できること。
- ネットワークが無い/不安定な朝でも記録自体は失敗しないこと（オフラインファースト）。

## 2. 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js 16 (App Router) / React 19 / TypeScript |
| スタイル | Tailwind CSS v4 |
| クラウドDB・認証 | Supabase (Postgres / Auth / Row Level Security) |
| ローカルキャッシュ | Dexie.js (IndexedDB) — `dexie-react-hooks` でライブクエリ |
| オフライン | 手書き Service Worker (`public/sw.js`) による PWA オフラインシェル |
| テスト | Vitest（ユニット） / Playwright（E2E, `e2e/record-flow.spec.ts`） |
| Lint/CI | ESLint、`.github/workflows/ci.yml`（push・PR毎に lint / test / build） |

## 3. ディレクトリ構成

```
src/
  app/
    page.tsx            ホーム（記録フロー: home → result → reason の3ステップ）
    _home/               ホーム画面専用の構成要素・状態管理フック
    timeline/page.tsx     これまでの記録一覧
    stats/page.tsx        傾向（集計・グラフ）
    export/page.tsx       期間指定エクスポート（印刷/PDF保存）
    group/page.tsx        家族との共有（グループ・子ども管理）
    login/page.tsx        マジックリンクログイン
  components/            共有UIコンポーネント（カレンダー、子ども切替、タグ選択 等）
  lib/
    supabase/client.ts    Supabaseクライアント
    auth/AuthProvider.tsx  認証状態のcontext
    db/                    Dexieローカルキャッシュ・オフライン同期ロジック
    date.ts, draft.ts, recordPreview.ts, errors.ts  各種ユーティリティ
  constants/choices.ts    記録フォームの選択肢（タグ）の唯一の情報源
  types/models.ts         SchoolRecord / Group / Child などの型定義
supabase/
  schema.sql              records / groups / children 等のテーブル・RLSポリシー
```

## 4. 主要機能

### 4.1 記録する（ホーム画面 `/`）

3ステップのフォームで、1日1件（子ども単位）の記録を作成・編集する。

1. **home** — 月間カレンダーで日付を選ぶ。記録済みの日は状態（スムーズ/行き渋り/お休み）が視覚的に分かる。カレンダー下の「記録する」ボタンは左右スワイプで前日/翌日に切り替え可能。未記録のリマインダー通知を表示。
2. **result** — 「今日はどうだった？」を3択で選ぶ：
   - `smooth`（😊 スムーズに行けた）
   - `reluctant`（😣 行き渋った）
   - `absent`（🏠 行かなかった）
3. **reason** — 選んだ結果に応じて理由タグの候補を出し分ける（前向きな理由 or 気になる理由）。タグは複数選択でき、「＋追加」でその場でカスタムタグを追加できる。詳細を開くと出発時刻・メモ（最大2000文字）も入力可能。保存すると入力内容から日記文を自動生成してプレビューする（`src/lib/recordPreview.ts`）。

補足仕様:
- 記録は日付単位で1件（同じ日に再度記録すると上書き編集になる）。複数の子どもがいる家庭では「日付＋子どもID」で1件。
- 入力中の状態はドラフトとして永続化され（`src/app/_home/draftStorage.ts` / `useDraftPersistence`）、離脱・再訪しても復元される。
- タイムラインの「編集する」リンクから `?date=...&childId=...` で遷移すると、該当日の記録内容に応じたステップまで自動で進む。
- 保存はまずローカル（Dexie, `syncStatus: "pending"`）に即座に書き込み、以後バックグラウンドでSupabaseに同期する。

### 4.2 これまでの記録（タイムライン `/timeline`）

- 自分の記録と、同じグループのパートナーの記録を新しい順に一覧表示。
- 子どもが複数いる場合は子ども切替で絞り込み可能（常に「すべて」から開始）。
- 自分の記録のみ「編集する」「削除する」が可能。パートナーの記録は閲覧のみで、アバター表示で誰の記録か分かる。
- 旧フォーム（v1以前）由来の記録（起床タグ・引き渡し先など）も後方互換で表示する。

### 4.3 傾向（統計 `/stats`）

- これまでの記録を「スムーズ/行き渋り/お休み」の内訳（件数・割合）でグラフ表示。
- 「良かった日によく見られる理由」「気になる日によく見られる理由」をタグ集計の棒グラフで表示。
- 子ども切替による絞り込みに対応。

### 4.4 エクスポート（`/export`）

- 学校の先生・スクールカウンセラー等への共有を想定し、期間指定（デフォルト直近30日）で記録を日記形式のテキストに整形して表示する。
- パートナーの記録を含めるかどうかを選択可能（含める場合も「(パートナーの記録)」という表示のみで、メールアドレス等の個人情報は出力しない）。
- ブラウザの印刷機能（「PDFとして保存」）で完結し、サーバーへの送信は行わない。

### 4.5 家族との共有（グループ `/group`）

- グループはユーザー1人につき同時に1つのみ所属可能（夫婦・家族単位。将来的に3人以上への拡張余地あり）。
- グループ作成 → 招待コード発行（有効期限24時間・1回限り使用）→ パートナーがコードを入力して参加、という流れ。
- グループに参加すると、以後どちらが記録してもタイムライン等でお互いの記録が見える（編集・削除は記録した本人のみ）。
- グループから脱退できる（確認ダイアログ経由）。
- 複数の子ども（`children`）を登録・管理できる。子どもが0〜1人の家庭では入力を増やさないため、記録は常に「未分類」（`childId: null`）として保存される。子どもを削除しても、紐づく記録自体は残る。

### 4.6 認証（ログイン `/login`）

- パスワード不要のマジックリンク／Email OTP認証（Supabase Auth）。
- 未ログインでもこの端末内での記録・閲覧は可能（オフラインファースト）。ログインするとSupabaseへの同期が有効になり、家族とデータを共有できる。
- 同一メールアドレスへの再送信は30秒のクールダウンを設ける（`localStorage`で送信時刻を保持し、再読み込みしても有効）。

## 5. データモデル

### 5.1 `SchoolRecord`（`src/types/models.ts` / `records`テーブル）

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | uuid | クライアント側でUUID生成。ローカル・クラウド間で同一IDを使い、同期を冪等にする。 |
| `recordDate` | `YYYY-MM-DD` | 記録対象日。 |
| `outcome` | `"smooth" \| "reluctant" \| "absent" \| null` | 登校の結果（3択）。未入力・旧形式はnull。 |
| `wakeTime` / `departTime` | `HH:MM \| null` | 起床時刻／出発時刻。 |
| `wakeTags` / `triggerTags` / `reasonTags` / `responseTags` | `string[]` | タグ群。`reasonTags`が現行フォームの理由タグ、他3つは旧フォーム（〜v1）由来で後方互換のため保持。 |
| `companion` / `handoff` | `string \| null` | 旧フォーム由来（同行者／引き渡し先）。 |
| `memo` | `string \| null`（最大2000字） | 自由記述メモ。 |
| `userId` | `string \| null` | 記録者。未同期のうちは未設定（＝自分の記録として扱う）。 |
| `childId` | `string \| null` | 対象の子ども。子ども未登録の家庭では常にnull。 |
| `createdAt` / `updatedAt` | timestamptz | 作成・更新日時。 |

ローカル専用の付加情報として `syncStatus`（`"pending" | "synced"`）を持つ（`LocalRecord`、`src/lib/db/localDb.ts`）。

### 5.2 `Group` / `GroupMember` / `GroupInvite` / `Child`

- `Group`: `id`, `name`, `created_by`, `created_at`。
- `GroupMember`: `group_id`, `user_id`（`unique`＝1ユーザー1グループ）, `joined_at`。
- `GroupInvite`: 招待コード。`expires_at`（発行から24時間）、`used_at`/`used_by`（1回限り使用）。
- `Child`: `id`, `created_by`, `name`（1〜50文字）, `created_at`。

## 6. サーバー（Supabase）仕様

`supabase/schema.sql` がスキーマ・RLSポリシーの正。ダッシュボードのSQL Editorで実行して構築する。

### 6.1 テーブルと索引

- `records`（`idx_records_user_id`, `idx_records_record_date`）
- `groups`, `group_members`（`idx_group_members_group_id`）, `group_invites`（`idx_group_invites_group_id`）
- `children`（`idx_children_created_by`）

### 6.2 Row Level Security（全テーブルで有効）

- **records**: SELECTは本人＋同グループメンバー。INSERT/UPDATE/DELETEは本人のみ。
- **groups**: SELECTは作成者本人＋所属メンバー。INSERTは作成者本人のみ。
- **group_members**: SELECTは本人＋`is_fellow_group_member()`（SECURITY DEFINER関数、無限再帰回避のため）で判定した同グループメンバー。INSERTは「自分が作成したグループに自分自身を追加する」場合のみ（招待経由の参加は下記関数を使う）。DELETEは本人のみ（脱退）。
- **group_invites**: SELECTは同グループメンバー。INSERTは同グループメンバー本人かつ有効期限が24時間+5分以内。
- **children**: SELECTは作成者本人＋同グループメンバー。INSERT/UPDATE/DELETEは作成者本人のみ。

### 6.3 SECURITY DEFINER関数（RPC）

| 関数 | 用途 |
|---|---|
| `create_group()` | グループ作成＋作成者を`group_members`へ追加をアトミックに実行。既に他グループに所属していれば`already_in_group`エラー。 |
| `redeem_group_invite(p_code)` | 招待コードの照合・消費（`group_members`追加＋`group_invites.used_at`更新）をアトミックに実行。無効/期限切れは`invite_invalid`、既に他グループ所属は`already_in_group`。 |
| `get_group_members()` | 自分の所属グループのメンバー一覧（`user_id`, `email`, `joined_at`）を返す。`auth.users.email`はクライアントから直接参照できないため、この関数経由でのみ取得。 |
| `is_fellow_group_member(p_group_id)` | 「自分が指定グループの同僚メンバーか」を判定する内部ヘルパー（RLSポリシーの無限再帰回避用）。 |

## 7. オフライン同期の仕組み

1. 「記録する」操作は `src/lib/db/records.ts` を通じて即座にDexie(IndexedDB)へ書き込まれる（`syncStatus: "pending"`）。
2. `src/lib/db/sync.ts` の `syncPendingChanges()` が起動時・オンライン復帰時（`window`の`online`イベント）に、`syncStatus: "pending"`のレコードをSupabaseへバッチ`upsert`し、成功したものを`"synced"`に更新する。
   - バッチ全体が失敗した場合は1件ずつ再試行し、問題のないレコードまで巻き込まれないようにする。
   - 削除も同様に `pendingRecordDeletes` をキューし、オンライン復帰時にまとめて削除を反映する。
3. `pullFromCloud()` がログイン直後・起動時に一度、Supabase側の記録をDexieへ取り込む（他端末・パートラーの記録の反映、ローカルIndexedDBが空の場合の復元用）。ローカルに未送信の変更（`"pending"`）がある行は上書きしない。クラウド側（RLS）から見えなくなった`synced`行はローカルからも削除する（グループ脱退・相手による削除など）。
4. IDはクライアント側でUUID生成し、ローカル・クラウドで同一IDを使うため、同期は冪等（idempotent）に行える。
5. 同期の成功/失敗は `src/lib/db/syncStatus.ts` の `reportSyncOutcome()` で記録され、UI上に同期失敗の通知（`SyncFailureNotice`）を出す。

## 8. PWA / オフラインシェル

- `public/sw.js`（手書きService Worker）がアプリシェルをキャッシュし、オフラインでも起動・記録できるようにする。
- `src/components/ServiceWorkerRegister.tsx` で登録。

## 9. テスト・CI

```bash
npm run lint       # ESLint
npm run test       # Vitest（ユニットテスト）
npm run build      # 型チェック込みの本番ビルド
npm run test:e2e   # Playwright（E2E, 別途起動が必要）
```

- push・PR毎に `.github/workflows/ci.yml` が lint / test / build を自動実行する。
- 主要ロジック（フォームの状態遷移、日付処理、同期処理、エクスポート抽出、グループ操作等）はほぼ全てユニットテストが付随している（`*.test.ts`）。
- `e2e/record-flow.spec.ts` に記録フロー全体のE2Eテストがある。

## 10. 非対応・意図的な制約

- 記録データのエクスポート時、サーバーへの送信は行わない（印刷/PDF保存のみ）。
- グループは1ユーザー1グループまで（3人以上の拡張は設計上考慮されているが未実装）。
- 招待コードは24時間・1回限りで失効する。
- 子どもが0〜1人の家庭では「子ども」概念をUIに出さない（`childId`は常にnull）。
