# おやノート

離れて暮らす両親(父・母)が毎日のようすを記録し、家族がその記録を確認できるスマホ向けアプリ(PWA)。
記録を完了すると、孫の写真が1枚表示される。

> 状態: 土台(タスク2)と DB のスキーマ・権限(タスク3)まで。画面からはまだ DB に接続しない(ログインはタスク4)。

- 要件: [docs/SPEC.md](docs/SPEC.md)
- 構成の決定: [docs/adr/0001-architecture.md](docs/adr/0001-architecture.md)(専用の Supabase プロジェクト、Vercel の別プロジェクト)

## DB(`supabase/`)

- `schema.sql` がスキーマの正(何度流しても同じ結果になる書き方)。表は `oya_` で始める。
  権限は RLS と `security definer` の関数で検証する(父・母は互いの記録を読めない、など。SPEC §2)。
- `tests/rls.test.sql`: 父・母・家族管理者・閲覧者・部外者・未ログインごとに、読める行・書ける行を確かめるテスト。
  `ci/supabase-stub.sql`(auth・storage・ロールのスタブ。`auth.uid()` がリクエストの JWT を返す)の上で、素の Postgres で動く。
- `src/lib/db/database.types.ts` は `npm run db:types` で生成する(手で直さない。CI が型ずれを検査する)。
- 本番への反映は `.github/workflows/db-deploy-oya.yml`(`main` へのマージで、`schema.sql` が変わったとき)。
  リポジトリ変数 `OYA_DB_DEPLOY_ENABLED=true` と Secret `OYA_SUPABASE_DB_URL` を登録するまでは、警告を出して何もしない。

## コマンド(このディレクトリで)

```bash
npm run dev            # 開発サーバー
npm run build          # 本番ビルド
npm run lint
npm run test           # 単体テスト(Vitest)
npm run test:e2e       # E2E(Playwright。先に npm run build が要る)
npm run test:db        # DB の権限のテスト(要 Docker。DB_URL を渡すとその空の DB で実行)
npm run db:types       # schema.sql から型(src/lib/db/database.types.ts)を再生成(要 Docker)
node scripts/generate-icons.mjs   # design/icon.svg からアイコンの PNG を書き出す
```

依存の導入はリポジトリのルートで `npm ci`(package-lock.json はルートに1つ)。

## 更新履歴

`src/data/releases.ts` に新しい順で書く。ユーザーに見える変更を入れるときは追加して、`package.json` /
`package-lock.json` の version も同じ値に上げる(CI の Release notes check が検査する。あさノート・よるノートと同じ)。
