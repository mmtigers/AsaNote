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
| Lint/CI | ESLint、`.github/workflows/ci.yml`（push・PR毎に3ジョブ。詳細は §9） |

## 3. ディレクトリ構成

```
src/
  app/
    page.tsx            ホーム（記録フロー: home → result → reason の3ステップ）
    _home/               ホーム画面専用の構成要素・状態管理フック
    timeline/page.tsx     これまでの記録一覧
    stats/page.tsx        傾向（集計・グラフ）
    export/page.tsx       期間指定エクスポート（印刷/PDF保存）
    group/                家族との共有（グループ・子ども管理・通知設定）
      page.tsx              ログイン状態の出し分けとセクションの組み立てのみ
      useChildrenAdmin.ts   お子さまの追加・改名・削除の状態と操作
      useGroupAdmin.ts      グループの作成・参加・招待・脱退の状態と操作
      useNotificationSettings.ts  未入力日リマインドPush通知のON/OFF・時刻の状態と操作
      ChildrenSection.tsx, GroupOnboardingSections.tsx, GroupMemberSections.tsx, NotificationSection.tsx  表示専用
      runAction.ts          失敗時に console.error + ユーザー向けメッセージを出す定型
    stats/
      page.tsx               集計結果の表示・各項目タップでの詳細シート起動
      aggregate.ts            曜日別/起床時刻別のスムーズ率等の集計純関数
      detail.ts               詳細シート用(期間別推移・簡単な統計値)の集計純関数
      StatsDetailSheet.tsx     詳細シート(期間別推移・統計値・該当する記録一覧)
    login/page.tsx        マジックリンクログイン
  components/            共有UIコンポーネント（カレンダー、子ども切替、タグ選択 等）
  lib/
    supabase/client.ts    Supabaseクライアント
    auth/AuthProvider.tsx  認証状態のcontext
    push.ts                ブラウザPush APIの薄いラッパー（購読作成・解除、VAPID鍵の変換）
    holidays.ts            日本の祝日判定（@holiday-jp/holiday_jpのオフライン同梱データ）
    db/                    Dexieローカルキャッシュ・オフライン同期ロジック
      ownership.ts           記録の所有判定（`isOwnRecord` / `canEditRecord`）の唯一の情報源
      useAuthedList.ts       ログイン状態に応じて一覧を取得する共通フック（`useChildren` / `useGroupMembers` の実体）
      notificationSettings.ts  push_subscriptions / notification_settingsテーブルの読み書き
      database.types.ts      `supabase gen types` の生成物。手で編集せず `scripts/gen-db-types.sh` で再生成する
    localStorageStore.ts  localStorageの1値を読み書きし同一タブへ通知する定型の唯一の情報源
                          （`selectedChild.ts` / `reminderDismissal.ts` / `draft.ts` が使う）
    date.ts, draft.ts, recordPreview.ts, errors.ts  各種ユーティリティ
  constants/choices.ts    記録フォームの選択肢（タグ）の唯一の情報源
  types/models.ts         SchoolRecord / Group / Child などの型定義
supabase/
  schema.sql              records / groups / children / push_subscriptions / notification_settings 等のテーブル・RLSポリシー
  functions/send-reminders/index.ts  未入力日リマインドPush通知の送信Edge Function（Deno。§4.7）
  cron-reminders.sql      Edge Functionをpg_cronで毎分呼び出す設定（手動適用。§4.7）
  ci/auth-stub.sql        CI（`db-types-check`）で素のPostgresに `auth.uid()` 等を代替定義するスタブ
scripts/gen-db-types.sh   `database.types.ts` の再生成スクリプト
e2e/record-flow.spec.ts   Playwright のE2Eテスト
docs/SPEC.md              本書
docs/push-notifications-setup.md  Push通知(§4.7)のデプロイ手順
```

## 4. 主要機能

### 4.1 記録する（ホーム画面 `/`）

3ステップのフォームで、1日1件（子ども単位）の記録を作成・編集する。

1. **home** — 月間カレンダーで日付を選ぶ。記録済みの日は状態（スムーズ/行き渋り/お休み）が視覚的に分かり、選択中の日付はアクセントカラーの塗りつぶしで強調される。日本の祝日（`@holiday-jp/holiday_jp`によるオフライン同梱データ）は日付を赤系の色で表示する（`src/lib/holidays.ts`、`src/components/MonthCalendar.tsx`）。土曜日は青、日曜日は赤（祝日と同じ色）で日付・曜日見出しを表示する（#4-1）。カレンダーの色分けはパートナーの記録も含める（傾向タブのカレンダーと同じロジック。`src/lib/db/queries.ts` の `useRecordStatusForMonth`）。カレンダー上部には、パートナーが当日の記録を済ませていれば完了バッジを表示する（`src/components/PartnerRecordStatus.tsx`）。カレンダー下の「記録する」ボタンは左右スワイプで前日/翌日に切り替え可能。未記録のリマインダー通知は、正午（12時）以降にアプリを開いた時点でその日の記録がまだ無い場合にのみアプリ内表示する（`src/components/RecordReminderNotice.tsx` の `REMINDER_HOUR`）。朝の記録前に催促しないための条件。アプリを閉じていても届くプッシュ通知は§4.7を参照。
2. **result** — 「今日はどうだった？」を3択で選ぶ：
   - `smooth`（😊 スムーズに行けた）
   - `reluctant`（😣 行き渋った）
   - `absent`（🏠 行かなかった）

   既に記録済みの日を開き直したときは、選択中の項目にリング＋チェックマークを表示する（`src/app/_home/ResultStepView.tsx`）。
3. **reason** — 画面上部に出発時刻の入力（任意）、その下に理由タグ。理由タグは選んだ結果に応じて候補を出し分け（前向きな理由 or 気になる理由）、複数選択でき、「＋追加」でその場でカスタムタグを追加できる。出発時刻は「8時より前 / 8時過ぎ / 8時半以降」の3区分から1つ選ぶだけ（`src/app/_home/DepartTimePicker.tsx`。もう一度押すと解除）。分単位の精度は振り返りに使っていないための割り切り。「詳細を追加」を開くと振り返りメモ（最大2000文字。`MEMO_MAX_LENGTH`。入力欄の`maxLength`と残り文字数表示、保存時の切り詰めで超過を防ぐ。DBの`CHECK`制約と同じ値 #57）を入力できる。保存すると入力内容から日記文を自動生成してプレビューする（`src/lib/recordPreview.ts`）。「今日の体調」（1〜5の5段階）は入力項目としては不要という判断で入力UIを外した（#5-4）。`conditionScale`フィールド・DBの列・同期ロジック自体は残しており、UIを復活させる場合は`src/app/_home/ConditionScalePicker.tsx`を`ReasonStepView`から再度呼び出すだけでよい。

補足仕様:
- 記録は日付単位で1件（同じ日に再度記録すると上書き編集になる）。複数の子どもがいる家庭では「日付＋子どもID」で1件。
- 入力中の状態はドラフトとして永続化され（`src/app/_home/draftStorage.ts` / `useDraftPersistence`）、離脱・再訪しても復元される。
- タイムラインのカードから `?date=...&childId=...` で遷移すると、該当日の記録内容に応じたステップまで自動で進む。
- 記録フローの途中（result / reason）で下部ナビの「記録する」を押すと最初の画面（home）へ戻る。既にホーム（`/`）にいるため Link だけでは画面が作り直されず、BottomNav（layout側）とステップ状態（page側）に共通の親も無いため、同一タブ内の window イベントで伝える（`src/lib/recordFlowReset.ts`）。
- 保存はまずローカル（Dexie, `syncStatus: "pending"`）に即座に書き込み、以後バックグラウンドでSupabaseに同期する。

### 4.2 これまでの記録（タイムライン `/timeline`）

- 自分の記録と、同じグループのパートナーの記録を新しい順に一覧表示。
- 子どもが複数いる場合は子ども切替で絞り込み可能（常に「すべて」から開始）。
- 結果（スムーズ/行き渋り/行かなかった）でも絞り込み可能（単一選択。子ども切替と同じ「常にすべてから開始」の方針。#4-2）。
- 自分の記録のみ編集・削除が可能。**✏️アイコンで編集**（記録フローへ遷移）、**隣接する🗑アイコンで削除**（確認ダイアログ経由）。誤タップを防ぐため2つのアイコンの間には`gap-3`の余白を設けている。パートナーの記録は閲覧のみで、アバター表示で誰の記録か分かる。
  認証情報の読み込み中（所有者が未確定）は、どの記録にも編集・削除の導線を出さない（#62）。所有判定は `src/lib/db/ownership.ts` の2関数に集約してあり、表示系（アバター・ラベル・エクスポート対象の絞り込み）は読み込み中を「自分の記録」と楽観的に扱う `isOwnRecord()`、編集・削除の導線は読み込み中を許可しない `canEditRecord()` を使う。表示の一瞬のちらつきと違い、誤って削除するとローカル（Dexie）から記録が消えるため。
- 旧フォーム（v1以前）由来の記録（起床タグ・引き渡し先など）も後方互換で表示する。

### 4.3 傾向（統計 `/stats`）

- これまでの記録を「スムーズ/行き渋り/お休み」の内訳（件数・割合）でグラフ表示。
- 「良かった日によく見られる理由」「気になる日によく見られる理由」をタグ集計の棒グラフで表示。
- 子ども切替による絞り込みに対応。
- 内訳カード・曜日別/起床時刻別のスムーズ率・理由タグの各項目はタップでき、該当する記録の詳細シート（`src/app/stats/StatsDetailSheet.tsx`）を開く。詳細シートには期間別推移（日別/週別/月別切替。`src/app/stats/detail.ts` の `groupRecordsByPeriod`）、簡単な統計値（記録日数・最も多い曜日・月平均件数。`computeDetailStats`）、該当する過去の記録一覧（自分の記録はタップでその日の記録へ）を表示する。

### 4.4 エクスポート（`/export`）

- 学校の先生・スクールカウンセラー等への共有を想定し、期間指定（デフォルト直近30日）で記録を日記形式のテキストに整形して表示する。
- パートナーの記録を含めるかどうかを選択可能（含める場合も「(パートナーの記録)」という表示のみで、メールアドレス等の個人情報は出力しない）。
- ブラウザの印刷機能（「PDFとして保存」）で完結し、サーバーへの送信は行わない。「印刷する」を押した瞬間に`document.title`を対象期間入りのファイル名（`asanote_YYYYMMDD-YYYYMMDD` / 単日は`asanote_YYYYMMDD`。`src/app/export/selectEntries.ts` の `buildExportFilename`）へ同期的に差し替えてから`window.print()`を呼ぶことで、保存時のファイル名候補に反映させる（`afterprint`イベントで元のタイトルへ戻す）。`useEffect`でdocument.titleを差し替える方式は、Next.jsのMetadata API（layoutのtitle）が別の再レンダリングのたびに書き戻してしまい効果が消えるため採用していない。
- 「📊 CSVでダウンロード」ボタンから、同じ期間・パートナー記録の絞り込みで構造化データ（日付・曜日・結果・起床時刻・出発時刻・タグ・メモ・記録者）のCSVもダウンロードできる（#4-2、`buildCsvContent` / `downloadCsv`）。日記形式の印刷出力とは別の集計・並び替え向けの形式。ファイル名は印刷時と同じ`buildExportFilename`を使う。Excelでの文字化けを防ぐためUTF-8 BOM付きで出力し、パートナーの記録は「記録者」列を「パートナー」とするのみでメールアドレス等は出力しない（印刷出力と同じ方針）。

### 4.5 家族との共有（グループ `/group`）

- グループはユーザー1人につき同時に1つのみ所属可能（夫婦・家族単位。将来的に3人以上への拡張余地あり）。
- グループ作成 → 招待コード発行（有効期限24時間・1回限り使用）→ パートナーがコードを入力して参加、という流れ。
- グループに参加すると、以後どちらが記録してもタイムライン等でお互いの記録が見える（編集・削除は記録した本人のみ）。
- グループから脱退できる（確認ダイアログ経由）。
- 複数の子ども（`children`）を登録・管理できる（追加・名前の変更・削除。削除は確認ダイアログ経由、#59）。子どもが0〜1人の家庭では入力を増やさないため、記録は常に「未分類」（`childId: null`）として保存される。子どもを削除しても、紐づく記録自体は残る（`records.child_id` が `on delete set null` のため、割り当てだけが外れる）。
- 「通知」セクション（`src/app/group/NotificationSection.tsx` / `useNotificationSettings.ts`）で、未入力日のリマインドプッシュ通知のON/OFFと通知時刻（既定21:00）を設定できる。詳しくは§4.7。

### 4.6 認証（ログイン `/login`）

- パスワード不要のマジックリンク／Email OTP認証（Supabase Auth）。
- 未ログインでもこの端末内での記録・閲覧は可能（オフラインファースト）。ログインするとSupabaseへの同期が有効になり、家族とデータを共有できる。
- 同一メールアドレスへの再送信は30秒のクールダウンを設ける（`localStorage`で送信時刻を保持し、再読み込みしても有効）。
- ログアウト時はこの端末のローカルDB（Dexie）を全消去する（共有端末で前ユーザーのデータが次のユーザーのアカウントへ誤同期されるのを防ぐ）。消去前に最終同期を1回試み、それでもクラウドへ未反映の変更（未送信の記録・未反映の削除）が残っていれば件数を示す確認ダイアログを出し、ユーザーが明示的に「消してログアウト」を選ばない限り消去しない（#58）。

### 4.7 未入力日のリマインドPush通知

アプリ内リマインダー（§4.1、アプリを開いたときだけ表示）とは別に、アプリを閉じていても届く本格的なPush通知。

- `/group`の「通知」セクションでON/OFFと通知時刻（既定21:00）を設定する。ONにする際、この端末でまだPush購読が無ければブラウザに通知の許可を求め、Web Push購読を作成する（`src/lib/push.ts`）。
- 購読情報は`push_subscriptions`テーブルへ、時刻・ON/OFFは`notification_settings`テーブルへ、それぞれ本人のみ読み書きできるRLSで保存する（`src/lib/db/notificationSettings.ts`）。
- 送信はSupabase Edge Function（`supabase/functions/send-reminders`）が担う。pg_cronが毎分呼び出し、JST時刻が`reminder_time`と一致し`enabled=true`のユーザーのうち、その日（JST）まだ`outcome`入りの記録が無い人だけへ、そのユーザーの全購読へPush通知を送る。送信が410/404で失敗した（失効した）購読はその場で削除する。
- Service Worker（`public/sw.js`）の`push`イベントで通知を表示し、`notificationclick`でアプリを開く/前面に出す。
- `supabase/schema.sql`（`push_subscriptions` / `notification_settings`テーブル）は他のテーブルと同様`main`マージ時に自動デプロイされるが、Edge Functionのデプロイ・VAPID鍵の発行・pg_cronのスケジュール登録（`supabase/cron-reminders.sql`）は自動化の対象外。デプロイ手順は`docs/push-notifications-setup.md`を参照。

## 5. データモデル

### 5.1 `SchoolRecord`（`src/types/models.ts` / `records`テーブル）

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | uuid | クライアント側でUUID生成。ローカル・クラウド間で同一IDを使い、同期を冪等にする。 |
| `recordDate` | `YYYY-MM-DD` | 記録対象日。 |
| `outcome` | `"smooth" \| "reluctant" \| "absent" \| null` | 登校の結果（3択）。未入力・旧形式はnull。 |
| `wakeTime` / `departTime` | `HH:MM \| null` | 起床時刻／出発時刻。DB 列は Postgres の `time` 型で `HH:MM:SS` として返るため、pull 時に先頭5文字へ正規化して `HH:MM` に揃える（#61。`src/lib/db/sync.ts` の `normalizeTimeValue`）。`departTime` は3区分（8時より前 / 8時過ぎ / 8時半以降）で入力し、区分ごとの代表値（`07:59` / `08:15` / `08:30`）を保存する。表示時は時刻から区分へ引き直すため、旧データの任意の時刻も同じ境界でいずれかの区分に寄る（`src/lib/departTime.ts`）。専用の列を足すとスキーマ変更と型の再生成が必要になるため、既存の列に載せている。 |
| `wakeTags` / `triggerTags` / `reasonTags` / `responseTags` | `string[]` | タグ群。`reasonTags`が現行フォームの理由タグ、他3つは旧フォーム（〜v1）由来で後方互換のため保持。 |
| `companion` / `handoff` | `string \| null` | 旧フォーム由来（同行者／引き渡し先）。 |
| `memo` | `string \| null`（最大2000字） | 自由記述メモ。 |
| `conditionScale` | `number \| null`（1〜5） | 記録した人自身のその朝の体調（5段階）。型・保存・同期ロジックは残っているが、入力UIは#5-4で`ReasonStepView`から外したため、新しい記録では常にnullになる（過去に入力済みの値は保持）。 |
| `userId` | `string \| null` | 記録者。未同期のうちは未設定（＝自分の記録として扱う）。 |
| `childId` | `string \| null` | 対象の子ども。子ども未登録の家庭では常にnull。 |
| `createdAt` / `updatedAt` | timestamptz | 作成・更新日時。 |

ローカル専用の付加情報として `syncStatus`（`"pending" | "synced"`）を持つ（`LocalRecord`、`src/lib/db/localDb.ts`）。

なお `records` テーブルには上表に対応しない `struggled`（`boolean`）列が残っている。旧フォーム（〜v1）の「登校を渋ったか」で、現在は `outcome` の3択に置き換わっている。**`SchoolRecord` / `LocalRecord` には対応するフィールドが無く、アプリは読み書きしない**（`supabase/schema.sql` と生成物の `src/lib/db/database.types.ts` にのみ現れる）。列の削除は #46 で2027年9月頃に旧タグ群とまとめて実施する方針。

### 5.2 `Group` / `GroupMember` / `GroupInvite` / `Child`

- `Group`: `id`, `name`, `created_by`, `created_at`。
- `group_members` テーブル: `group_id`, `user_id`（`unique`＝1ユーザー1グループ）, `joined_at`。対応する TypeScript の型は持たない（アプリがこの行をそのまま扱う箇所が無いため）。メンバー一覧の表示には、`SECURITY DEFINER` 関数 `get_group_members` 経由で email を含めて取得する `GroupMemberProfile` を使う。
- `GroupInvite`: 招待コード。`expires_at`（発行から24時間）、`used_at`/`used_by`（1回限り使用）。
- `Child`: `id`, `created_by`, `name`（1〜50文字）, `created_at`。

### 5.3 `push_subscriptions` / `notification_settings`（§4.7）

対応するTypeScriptの型は持たない（アプリがこの行をそのまま扱う箇所が無いため、`src/lib/db/notificationSettings.ts` がSupabaseへの読み書きを直接行う）。

- `push_subscriptions`: `id`, `user_id`, `endpoint`（`unique`）, `p256dh`, `auth_key`, `created_at`。1ユーザーが複数端末を持ちうるため複数行を許容し、同じ`endpoint`での再購読は`upsert`で更新する。
- `notification_settings`: `user_id`（主キー）, `reminder_time`（`time`、既定`21:00`）, `enabled`（`boolean`、既定`true`）, `updated_at`。ユーザー1人につき1行。

## 6. サーバー（Supabase）仕様

`supabase/schema.sql` がスキーマ・RLSポリシーの正。初回はダッシュボードのSQL Editorで実行して構築し、以降の変更は `main` へのマージ時に `.github/workflows/db-deploy.yml` が本番へ自動適用する（#53）。`schema.sql` は冪等（`create table if not exists` / `alter table ... add column if not exists` / `drop policy if exists` → `create policy` / `create or replace function`）で `drop table` を含まないため、毎回まるごと適用してよい。ただし列の削除・リネーム（#46）はこの仕組みでは届かないため、その時は手動で実施するかマイグレーション方式への移行を検討する。

### 6.1 テーブルと索引

- `records`（`idx_records_user_id`, `idx_records_record_date`）
- `groups`, `group_members`（`idx_group_members_group_id`）, `group_invites`（`idx_group_invites_group_id`）
- `children`（`idx_children_created_by`）
- `push_subscriptions`（`idx_push_subscriptions_user_id`）, `notification_settings`

### 6.2 Row Level Security（全テーブルで有効）

- **records**: SELECTは本人＋同グループメンバー。INSERT/UPDATE/DELETEは本人のみ。
- **groups**: SELECTは作成者本人＋所属メンバー。INSERTは作成者本人のみ。
- **group_members**: SELECTは本人＋`is_fellow_group_member()`（SECURITY DEFINER関数、無限再帰回避のため）で判定した同グループメンバー。INSERTは「自分が作成したグループに自分自身を追加する」場合のみ（招待経由の参加は下記関数を使う）。DELETEは本人のみ（脱退）。
- **group_invites**: SELECTは同グループメンバー。INSERTは同グループメンバー本人かつ有効期限が24時間+5分以内。
- **children**: SELECTは作成者本人＋同グループメンバー。INSERT/UPDATE/DELETEは作成者本人のみ。
- **push_subscriptions** / **notification_settings**: SELECT/INSERT/UPDATE/DELETEすべて本人のみ（グループメンバーであっても他人の購読・設定は読み書きできない）。送信を担うEdge Functionはservice roleで動くためRLSを経由しない。

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
   - 削除も同様に `pendingRecordDeletes` をキューし、オンライン復帰時にまとめて削除を反映する。キューは`syncStatus`に関わらず必ず積む（同期済みの記録を編集すると`"pending"`に戻るため、`"synced"`のときだけ積むと「編集→削除」した記録のリモート削除が漏れ、次回の`pullFromCloud()`で復活していた）。一度もクラウドに存在しなかったidの削除はサーバー側で0件ヒットの無害な操作になる。
3. `pullFromCloud()` がSupabase側の記録をDexieへ取り込む（他端末・パートナーの記録の反映、ローカルIndexedDBが空の場合の復元用）。呼ばれるのはログイン直後・起動時に加えて、グループへの参加後と脱退後（`src/app/group/useGroupAdmin.ts`）。参加直後はパートナーの記録が、脱退直後はRLSで見えなくなった記録の削除が、それぞれ即座に反映される必要があるため。ローカルに未送信の変更（`"pending"`）がある行は上書きしない。クラウド側（RLS）から見えなくなった`synced`行はローカルからも削除する（グループ脱退・相手による削除など）。取得は`record_date, id`順に`PULL_PAGE_SIZE`（500）件ずつの全ページ取得で、途中のページが失敗した場合は反映も削除も行わない（PostgRESTは1リクエストの行数上限を黙って切り捨てるため、ページングなしだと取得漏れ行を「見えなくなった」と誤判定して消してしまう）。
4. IDはクライアント側でUUID生成し、ローカル・クラウドで同一IDを使うため、同期は冪等（idempotent）に行える。
5. 同期の成功/失敗は `src/lib/db/syncStatus.ts` の `reportSyncOutcome()` で記録され、UI上に同期失敗の通知（`SyncFailureNotice`）を出す。
6. **競合の解決方針（#61）**: `updatedAt` を比較する LWW ではなく、「ローカルが `pending` ならローカルを優先、それ以外はリモートで上書き」とする。したがって2端末で同じ記録をオフライン編集した場合は、**後から同期した側の内容が残る**（順序依存）。個人・夫婦間での利用を前提とした割り切りで、同時編集の自動マージは行わない。
7. **同日に複数の記録がある場合（#61）**: DB に `(user_id, record_date, child_id)` の一意制約は無く、2端末でオフライン中に同じ日を新規作成すると2件になりうる。表示・編集の対象は `findLatestOwnRecordForDate()` が選ぶ直近の1件で、古い方はタイムラインに残る（自動的な統合・削除はしない）。

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

- push・PR毎に `.github/workflows/ci.yml` が3ジョブを自動実行する。
  - `lint-build-test`: `npm audit` → `lint` → `next typegen` → `tsc --noEmit` → `test:coverage`（カバレッジは `coverage-report` 成果物として14日保存。閾値は設けない）→ `build`
  - `e2e-test`: Playwright
  - `db-types-check`: `supabase/schema.sql` を素の Postgres へ適用し、`supabase gen types` の出力と `database.types.ts` の差分を検査
  - `supabase/functions/`（Deno / Supabase Edge Functions）はこのNext.js/Nodeプロジェクトの一部ではないため、`tsconfig.json`の`exclude`と`eslint.config.mjs`の`globalIgnores`の両方で対象外にしてある。CIの`tsc --noEmit`・`lint`はこのディレクトリを検査しない。
  - ワークフローは最小権限（`permissions: contents: read`）で動き、各ジョブに `timeout-minutes` を設定している。依存更新は `.github/dependabot.yml` が週次で minor/patch をまとめた1本の PR として起票する。
- `main` への push で `supabase/schema.sql` が変わったとき、`.github/workflows/db-deploy.yml` が本番Supabaseへ `psql --single-transaction` で適用する（#53）。`db-types-check` とは役割が別で、あちらは一時Postgresコンテナに適用して型のドリフトを検査するだけで本番DBには触れない。
- 主要ロジック（フォームの状態遷移、日付処理、同期処理、エクスポート抽出、グループ操作等）はほぼ全てユニットテストが付随している（`*.test.ts`）。
- `e2e/record-flow.spec.ts` に記録フロー全体のE2Eテストがある。

## 10. 計測(記録フローのアナリティクス)

「サッと記録できる」というコンセプト(§1)が実際に達成できているかを見るため、記録フロー
(home→result→reason)の所要時間・ステップごとの離脱率を`analytics_events`テーブルへ計測する
(`src/lib/analytics.ts`の`track()`)。

- ログイン前(オフライン専用利用)は同期先が無いため何も送信しない。送信失敗はconsole.errorに
  留め、記録データ本体の保存(Dexie/Supabase)には一切影響させない。記録データと違いオフライン
  キューは持たせておらず、完全オフライン時のイベントロスは許容する。
- `record_id`には各記録の`FormState.id`(UUID)をそのまま使い、フロー内の一連のイベントを
  紐付ける相関キーとする。
- イベント一覧:
  | イベント | 発火箇所 | 主なプロパティ |
  |---|---|---|
  | `record_flow_started` | `page.tsx`の`startRecording`/`startEditingExisting`/`handleReminderStartRecording`、`useRecordForm`のタイムライン編集リンク自動遷移 | `entry_point`("home_start_button"\|"home_edit_existing"\|"push_reminder"\|"timeline_edit_link"), `is_edit`, `date_offset_days`(今日=0、過去日はマイナス) |
  | `record_step_viewed` | `page.tsx`(`stepTransition.seq`変化を監視) | `step`("result"\|"reason"), `direction`("forward"\|"backward") |
  | `record_outcome_selected` | `useRecordForm.selectOutcome` | `outcome`, `changed_from_existing` |
  | `record_saved` | `useRecordForm.handleSave` | `reason_tag_count`, `has_memo`, `depart_time_set`, `is_edit`(下書き復元経由のセッションでは不明なため省略することがある) |
  | `record_flow_paused` | `page.tsx`(保存を伴わずhomeへ戻った時) | `last_step`, `reason`("bottom_nav_reset"\|"back_navigation") |
  | `record_flow_resumed` | `useRecordForm`(下書き復元時) | `resumed_step` |
- 下書き(§4.1)が残るため、保存せずhomeへ戻っても即「離脱」とはせず「中断」として扱い
  (`record_flow_paused`)、後日再開したら`record_flow_resumed`を送る。ブラウザ/アプリを
  閉じてそのまま戻らない完全な離脱までは検知しない(このアプリの記録フローはページ内
  ステップ遷移が主で、離脱の多くはアプリ内操作を経るため、beforeunload等までは実装していない)。
- `analytics_events`はRLSで本人によるINSERTのみ許可し、クライアントからの読み取りはできない
  書き込み専用ログ(集計はservice role/ダッシュボード側で行う想定)。

## 11. 非対応・意図的な制約

- 記録データのエクスポート時、サーバーへの送信は行わない（印刷/PDF保存のみ）。
- グループは1ユーザー1グループまで（3人以上の拡張は設計上考慮されているが未実装）。
- 招待コードは24時間・1回限りで失効する。
- 子どもが0〜1人の家庭では「子ども」概念をUIに出さない（`childId`は常にnull）。
