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
| `npm test` | 単体テスト |
| `npm run build` | 本番ビルド |

## 現在の状況

段階0(スキャフォールド)。ログイン、グループ(作成/招待/参加/脱退)、子ども管理(追加/改名/削除)まで実装済み。
記録フォーム、ローカルDB・同期、`evening_*` テーブルはこれから。アイコンは仮のものです。
