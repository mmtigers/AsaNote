# よるノート

帰宅から就寝までの夜のようすを、子どもが寝た後にサッと記録する家族向けメモアプリ。
[あさノート](https://github.com/mmtigers/asanote) の姉妹アプリです。仕様は [docs/SPEC.md](./docs/SPEC.md) を参照。

## 技術スタック

- Next.js (App Router, TypeScript, Tailwind CSS)
- Supabase (Postgres / Auth) — 初期はあさノートと同じプロジェクトを共有(SPEC §7)
- Dexie.js (IndexedDB) — オフライン優先のローカルキャッシュ
- 手書きService Worker (`public/sw.js`) — PWAオフラインシェル・Push通知の受信
- Vitest / Testing Library

## セットアップ

```bash
npm install
cp .env.local.example .env.local   # Supabaseの URL / anon key を設定
npm run dev
```

## Supabase(共有モード)

共通表(`groups` / `group_members` / `group_invites` / `children` と、`create_group` / `redeem_group_invite` / `get_group_members`)は
**あさノート側の `supabase/schema.sql` が正**です。同じプロジェクトを使う限り、よるノート側での作成は不要です。
認証は[メールのマジックリンク](https://github.com/mmtigers/asanote#認証メールのマジックリンク)で、Site URL / Redirect URLs に
よるノートのURLも追加してください。よるノート固有の表(`evening_*`)は記録機能のPRで追加します(SPEC §7)。

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | 型チェック(事前に `npx next typegen`) |
| `npm run check:schema` | `supabase/schema.sql` が `evening_*` 以外(あさノートと共有する表)に触れていないかを検査 |
| `npm run db:types` | `schema.sql` から `src/lib/db/database.types.ts` を再生成(要 Docker) |
| `npm test` | 単体テスト |
| `npm run build` | 本番ビルド |

## 現在の状況

段階0〜1(MVPの中核)。次が実装済みです。

- ログイン、グループ(作成/招待/参加/脱退)、子ども管理
- 記録フォーム(様子、節目の時刻、夕食、自由時間・友達、荒れ、からだ、メモ+写真、日記文プレビュー)
- 月カレンダー、下書き自動保存、前日の引き継ぎ、これまでの記録(一覧・編集・削除)
- オフラインでも保存でき、通信が回復すると自動で同期(写真は縮小して Storage へ)
- 傾向(様子の内訳・カレンダー・宿題開始時刻/友達との約束/消灯時刻と様子・きっかけ・効いた対応)
- エクスポート(期間・子ども指定の印刷/PDF、CSV。写真は印刷/PDFに任意で含める)
- 夜のリマインドPush(「共有」タブで時刻を設定。デプロイ手順は [docs/push-notifications-setup.md](./docs/push-notifications-setup.md))

まだこれからのもの: なし(あさノート連携の傾向は共有モードのときだけ傾向タブに出ます)。

試したこと/検討事項ボード(`/rules`)を使うには `supabase/schema.sql` の末尾(`evening_rules` `evening_concerns`)を SQL Editor で実行してください。

### 初回のSupabase準備

[supabase/schema.sql](./supabase/schema.sql) を SQL Editor で実行する(共通表がある前提。先頭のコメント参照)。
写真用の非公開バケット `evening-photos` とそのポリシーも同じファイルで作られる。
アイコンは仮のものです。

## 過去メモの取り込み(ローカル専用)

過去のメモをテストデータとして取り込むスクリプト(`scripts/import-records.mjs`)があります。データ本体は個人情報を含むので、`scripts/data/` か `*.local.json` に置いてください(どちらも `.gitignore` 済みで、コミットされません)。形式は `scripts/import-records.example.json`(架空のデータ)を参照。

```bash
# まず検証だけ(DB には書き込まない)
node scripts/import-records.mjs scripts/data/records.json you@example.com --dry-run

# 取り込み(service role key は環境変数で渡し、絶対にコミットしない)
SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxxx \
  node scripts/import-records.mjs scripts/data/records.json you@example.com [子どもID]
```

同じユーザー・日付・子どもの記録があれば上書きするので、何度実行しても結果は同じです。
