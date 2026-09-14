# あさノート

子どもが登校を渋る朝のようすを、選ぶだけでサッと記録する家族向けメモアプリ。

- 起床時刻・前日のきっかけ・渋る理由・親の対応・登校結果をタグでワンタップ入力
- 入力内容から今までの日記に近い文章を自動生成してプレビュー
- 夫婦・家族単位でグループを作ると、どちらが記録しても両方のスマホから見える
- オフラインでも記録でき、通信が回復すると自動で同期する

## 技術スタック

- Next.js (App Router, TypeScript, Tailwind CSS)
- Supabase (Postgres / Auth)
- Dexie.js (IndexedDB) — オフライン優先のローカルキャッシュ
- 手書きService Worker (`public/sw.js`) — PWAオフラインシェル

## セットアップ

```bash
npm install
cp .env.local.example .env.local
# .env.local に Supabase の URL / anon key を設定
npm run dev
```

Supabase側のテーブル作成は [supabase/schema.sql](./supabase/schema.sql) をSQL Editorで実行する。

### 認証（マジックリンク/Email OTP）

パスワード不要のマジックリンク認証を採用している。Supabaseダッシュボードで以下を設定すること。

1. 「Authentication」→「URL Configuration」で **Site URL** と **Redirect URLs** に
   アプリのURL（開発時は `http://localhost:3000`、本番は実際のドメイン）を追加する。
   未設定だとログインリンクのリダイレクトが失敗する。
2. ログインしなくてもこの端末内での記録・閲覧は可能（オフラインファースト）。
   ログインするとSupabaseへの同期が有効になり、家族とデータを共有できる。

### 家族との共有（グループ機能）

「共有」タブからグループを作成し、招待コードをパートナーに共有すると、以後どちらが
記録してもお互いのスマホから見えるようになる。編集・削除は記録した本人のみ可能。

## ディレクトリ構成

```
src/
  app/            App Routerのページ・レイアウト
  components/     共有UIコンポーネント
  lib/
    supabase/     Supabaseクライアント
    db/           Dexieローカルキャッシュ・オフライン同期ロジック
  constants/      記録フォームの選択肢(タグ)の唯一の情報源
  types/          SchoolRecord / Group などの型定義
supabase/
  schema.sql      records / groups テーブル定義・RLSポリシー
```

## オフライン同期の仕組み

1. 「記録する」操作は `src/lib/db/records.ts` を通じて即座にDexie(IndexedDB)へ書き込まれる（`syncStatus: "pending"`）。
2. `src/lib/db/sync.ts` の `syncPendingChanges` がオンライン復帰時・起動時に `syncStatus: "pending"` のレコードをSupabaseへバッチupsertし、成功したものを `"synced"` に更新する。
3. `src/lib/db/sync.ts` の `pullFromCloud` がログイン直後・起動時にSupabase側の記録をDexieへ取り込む。他端末(パートナーの端末)での記録や、この端末のIndexedDBが空(再インストール等)の場合の復元に使う。ローカルに未送信の変更(`"pending"`)がある行は上書きしない。
4. IDはクライアント側でUUID生成し、ローカルとクラウドで同一IDを使うため、同期はべき等（idempotent）に行える。

## テスト

```bash
npm run lint       # ESLint
npm run test       # Vitest（ユニットテスト）
npm run build      # 型チェック込みの本番ビルド
```

push・PR毎に `.github/workflows/ci.yml` が上記3つを自動実行する。
