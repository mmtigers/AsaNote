# あさノート 仕様書

子どもが登校を渋る朝のようすを、選ぶだけでサッと記録する家族向けPWA。
本書は実装（`src/`・`supabase/`・`public/sw.js`・`e2e/`・`.github/workflows/`）から起こした現状の仕様書で、**食い違いがあれば実装が正**。
対象バージョン: v0.4.2（`src/data/releases.ts` 先頭）。

## 本書の使い方・メンテナンス方針

- 実装箇所は `path/to/file.ts` で示す（行番号は書かない）。
- コードから意図が確証できない点は **要確認 Qn** と明記し、付録A に一覧する。解消したら本文へ反映して付録から消す。
- 「〜のため（推定）」は、コードやコメントに根拠が無く、書き手が理由を補った箇所。

### 更新ルール

CIが強制するもの（`.github/workflows/ci.yml` の `release-notes-check`、判定は `scripts/check-release-notes.mjs`）:

| 条件 | 結果 |
|---|---|
| `src/app/` `src/components/` `src/lib/` `src/constants/` `public/` に、テスト（`*.test.ts(x)`）・生成型（`database.types.ts`）以外の変更がある | `src/data/releases.ts` の更新が必須。先頭 version が変更前より新しくなければ失敗 |
| `releases.ts` 先頭・`package.json`・`package-lock.json` の version が不一致 | 常に失敗（例外指定でも確認される） |
| PRに `no-release-note` ラベル、またはPR本文・タイトル・コミットメッセージに `[skip release-note]` | 更新履歴の追加チェックのみ省略（依存更新・内部リファクタ等） |

CIが強制しないもの（レビューで担保する）:

- **本書の更新はCIの対象外**。挙動・スキーマ・運用手順を変えるPRは、同じPRで本書も更新する。ユーザー向けの変更なら `releases.ts` と version（`package.json` / `package-lock.json`）も同じPRで更新する。
- `docs/`・`README.md`・`supabase/`・`scripts/`・`e2e/` のみの変更は `release-notes-check` の対象外（更新履歴は不要）。
- `supabase/schema.sql` を変えたら `npm run db:types` で `src/lib/db/database.types.ts` を再生成する（`db-types-check` が差分を検出して失敗させる）。`main` マージ時に本番へ自動適用される（§8）。
- Push通知まわりのSQL・Edge Functionは自動適用されない（§8、`docs/push-notifications-setup.md`）。

