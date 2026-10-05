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

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | 型チェック(事前に `npx next typegen`) |
| `npm test` | 単体テスト |
| `npm run build` | 本番ビルド |

## 現在の状況

段階0(スキャフォールド)の途中。画面は仮ページのみで、認証・グループ・子ども管理・記録フォームはこれから。
アイコンは仮のものです。
