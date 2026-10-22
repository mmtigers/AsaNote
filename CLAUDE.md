@AGENTS.md

## Claude Code 開発自動化(このリポジトリ固有)

共通スキル(`repo-survey` / `issue-fix` / `verify-handoff`)の原本は `devx/skills/`。個人環境へは `devx/install.sh` で入れる(既存は上書きしない)。詳細は `devx/README.md`。

- 検証: `bash ~/.claude/skills/verify-handoff/verify.sh --keep-going`(または `devx/skills/verify-handoff/verify.sh`)。手順は `.claude/verify.steps` に定義(CI の `_app-ci.yml` / `ci-core.yml` と同じ順。**CI を変えたらここも更新**)。結果は `.claude/handoff/latest.md`(gitignore)。
- 変更前に `docs/MONOREPO.md` と `.github/pull_request_template.md` を読む。ユーザーに見える変更(`src/app|components|lib|constants|public`、`packages/core/src`)は 各アプリの `src/data/releases.ts`(`apps/<app>/` 配下)と version(`package.json` / `package-lock.json`)の更新が必要(`scripts/check-release-notes.mjs` が CI で強制)。載せない変更は `[skip release-note]`。
- `supabase/schema.sql` の変更は `main` へのマージで**本番 DB に自動適用**される。変更時は `npm run db:types` も。Edge Function / cron は手動デプロイ(`apps/asa/docs/push-notifications-setup.md`)。
- `verify.steps` の対象は `packages/core`・`apps/asa`・`apps/yoru`・`apps/oya`(`--only apps/yoru` で絞れる)。E2E(Playwright)と、DB 接続が要る `apps/oya` の `test:db` は含めない(CI で実行)。
