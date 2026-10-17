# あさノート / よるノート / おやノート(モノレポ)

登校渋りの「朝」を記録する**あさノート**と、「夜」を記録する**よるノート**、離れて暮らす両親の毎日を記録する**おやノート**を、1つのリポジトリで開発する。

```
apps/asa/      あさノート(本番運用中)
apps/yoru/     よるノート(公開前)
apps/oya/      おやノート(土台のみ。専用の Supabase プロジェクトを使う。apps/oya/docs/adr/0001-architecture.md)
packages/core/ 共通コード(@note/core。日付・祝日・エラー表示・localStorage ストアなど。Phase 1 で少しずつ移している)
supabase/      あさノートの schema・Edge Functions・cron(共有DBの共通表の「正」。移動しない)
.github/       CI・DB反映ワークフロー(アプリごとに分け、共通のジョブは `_app-ci.yml` / `_db-types-check.yml` に切り出してある)
docs/          モノレポ全体の運用ドキュメント(アプリ固有の docs は apps/*/docs)
```

Node のバージョンは [.nvmrc](.nvmrc) が正(CI の `setup-node` も、これを読む)。上げるときは `.nvmrc` だけを直す。
Vercel・`engines`・`@types/node` の major(現在 26)は、これとは別に管理している(意図的。#116)。

アプリごとの README・仕様は `apps/asa/README.md` / `apps/yoru/README.md` / `apps/oya/README.md`、`apps/*/docs/SPEC.md` を参照。
構成の経緯・Vercel の設定・切り戻し手順は [docs/MONOREPO.md](docs/MONOREPO.md)。

## よく使うコマンド(リポジトリのルートで)

```bash
npm ci                 # 全ワークスペースの依存を入れる(package-lock.json はルートに1つ)
npm run dev:asa        # あさノートを起動
npm run dev:yoru       # よるノートを起動
npm run dev:oya        # おやノートを起動
npm run lint           # 全アプリの lint
npm run test           # 全アプリ・共通コードの単体テスト
```

アプリ単体のコマンド(`build` / `test:e2e` / `db:types` など)は、`apps/<app>` へ移動して実行するか、
`npm run <script> --workspace apps/<app>` で実行する。
