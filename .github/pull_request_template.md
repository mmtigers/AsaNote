## 変更の内容
<!-- 何を・なぜ変えたか。関連 Issue は `Closes #123` のように書く -->

## 確認(CI が強制しないもの。該当しなければ「なし」でよい)
<!-- CI が見るのは: 更新履歴(`src/data/releases.ts`)と版の一致、`schema.sql` と `database.types.ts` のずれ、lint/型/テスト。下は人が確認する項目 -->
- [ ] 挙動・スキーマ・運用手順を変えたので、同じ PR で `apps/<app>/docs/SPEC.md`(と関連 docs)を更新した
- [ ] `supabase/schema.sql`(よるノートは `apps/yoru/supabase/schema.sql`)を変えたので、`npm run db:types` で型を再生成した(`db-types-check` が検出)。`main` へのマージで本番 DB に自動適用される点も確認した
- [ ] Edge Function / cron / trigger を変えた場合: **自動反映されない**ので、手動デプロイ・SQL の実行が要る(手順は `apps/asa/docs/push-notifications-setup.md` / `docs/group-cleanup.md`)。要否と、いつ行うかを下に書いた
- [ ] ユーザーに見える変更は `releases.ts` と version(`package.json` / `package-lock.json`)を上げた。`packages/core/src/` の変更は**あさノート・よるノートの両方**で必要
- [ ] `[skip release-note]` / `no-release-note` を使う場合は、更新履歴に載せない理由を下に書いた

## 手動作業・補足
<!-- 手動デプロイや SQL の実行が要るときの手順、例外指定の理由、レビューで見てほしい点 -->
