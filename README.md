# あさノート / よるノート(モノレポ)

登校渋りの「朝」を記録する**あさノート**と、「夜」を記録する**よるノート**を、1つのリポジトリで開発する。

```
apps/asa/      あさノート(本番運用中)
apps/yoru/     よるノート(公開前)
supabase/      あさノートの schema・Edge Functions・cron(共有DBの共通表の「正」。移動しない)
.github/       CI・DB反映ワークフロー(アプリごとに分けてある)
docs/          モノレポ全体の運用ドキュメント(アプリ固有の docs は apps/*/docs)
```

アプリごとの README・仕様は `apps/asa/README.md` / `apps/yoru/README.md`、`apps/*/docs/SPEC.md` を参照。
構成の経緯・Vercel の設定・切り戻し手順は [docs/MONOREPO.md](docs/MONOREPO.md)。

## よく使うコマンド(リポジトリのルートで)

```bash
npm ci                 # 全ワークスペースの依存を入れる(package-lock.json はルートに1つ)
npm run dev:asa        # あさノートを起動
npm run dev:yoru       # よるノートを起動
npm run lint           # 全アプリの lint
npm run test           # 全アプリの単体テスト
```

アプリ単体のコマンド(`build` / `test:e2e` / `db:types` など)は、`apps/<app>` へ移動して実行するか、
`npm run <script> --workspace apps/<app>` で実行する。
