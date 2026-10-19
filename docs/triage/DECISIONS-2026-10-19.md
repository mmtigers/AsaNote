# Issue 整理の結果と判断リスト(2026-10-19)

対象: オープン中の 8 Issue(#237 #228 #226 #173 #156 #117 #116 #114)。
基準: main `6974336`。ベースライン(lint・`typecheck:core`・全テスト・`build:asa`)はすべて通過(asa 516 / yoru 221 / oya 130 / core 247 tests)。Actions の枠に頼らず、すべてローカルで検証した。

分類: A=自律解決可 / B=条件待ち / C=要判断 / D=要手動

## 分類一覧

| Issue | 分類 | 状態 | PR |
|---|---|---|---|
| #237 Actions 分数の水平展開 | B | 11/1 ごろの実測待ち。再開条件と手順をコメント | - |
| #228 よるノート docs の突き合わせ | A + D | SPEC の Vercel 記述を修正(A)。Redirect URLs の確認がオーナー作業(D) | [#267](https://github.com/mmtigers/AsaNote/pull/267)(ドラフト。`Closes` なし) |
| #226 CI 復旧後の確認 | D | 残りは画面確認 2 件のみ。手順をコメント | - |
| #173 よるノート公開後の確認 | D | 実機作業。確認用 SQL(読み取り専用)を用意 | 本 PR(`docs/triage/173-verify-readonly.sql`) |
| #156 モノレポ整理(Phase 3) | C + B | Dependabot 項目は確認済み。残り 2 件は判断(D3・D4) | - |
| #117 実 Supabase E2E | B + D | 実装・ワークフローは済み。テスト用プロジェクトと Secrets 待ち | - |
| #116 メジャー更新 | A(検証)+ C | ESLint 10・TS 7 を専用ブランチで検証。**Issue の保留理由が古い**。採否は判断(D1・D2) | [#268](https://github.com/mmtigers/AsaNote/pull/268)(検証のみ・マージ不可) |
| #114 旧フィールド削除 | B | 2027 年 9 月まで着手不可。件数確認用 SQL を用意 | 本 PR(`docs/triage/114-legacy-fields-count.sql`) |

## 分類の根拠(確認したもの)

- **#237 / B**: 本文と 10/18 のコメントで、PR 3 本はクローズ済み。残りは「枠が戻った後(11/1 ごろ)に Billing で実測」のみ。外部条件。
- **#228 / A+D**: コメント 10/14 の「`SPEC.md` の `:732` と `:771` 付近の古い記述」を確認。CI 表・E2E の記述は `ci.yml` / `e2e-supabase.yml` と一致していたが、`SPEC.md` の「Vercel プロジェクト名 `go-to-school`」と Q12 は、`docs/MONOREPO.md` の表(`asa-note`)と食い違っていた。これを修正し、ガードのテストを追加(#267)。Redirect URLs の確認は Supabase の画面が要るため D。
- **#226 / D**: 10/13〜14 のコメントで、CI 構成・型・DB・cron・CSP は確認済み。残りは Actions の画面での表示確認(Coverage summary)と Dependabot の PR(#234 への rebase)。
- **#173 / D**: 10/14 のコメントで、`evening_push_subscriptions` は 0 行(パートナー未リリース)。実機の操作が要る。
- **#156 / C+B**: Dependabot 項目は「次の月曜(10/12)の PR で確認」とある。main の履歴に `dependabot/npm_and_yarn/patch-and-minor-…` のマージ(#266)があり、ルートの `package-lock.json` を扱えている証拠。残りは `supabase/` の置き場の統一と `pushLogic.ts` の共通化で、いずれも Issue 本文が「見送り推奨」「必要になったら判断」。方針の判断。
- **#117 / B+D**: `apps/asa/e2e-supabase/`、`playwright.supabase.config.ts`、`.github/workflows/e2e-supabase.yml`、`apps/asa/docs/e2e-supabase.md` は実在。`E2E_SUPABASE_ENABLED` 未設定でスキップされる状態(#226 のコメントで確認済み)。テスト用 Supabase プロジェクトと Secrets は私には作れない。
- **#116 / A+C**: 下の「#116 検証結果」参照。
- **#114 / B**: 基準日は移行日 2026-09-14 + 1 年 = 2027 年 9 月頃。それまでは着手しない、と本文に明記。

## #116 検証結果(PR #268。ローカル、Node 22.22.0)

| 項目 | ESLint 10.13.0 | + TypeScript 7.0.2 |
|---|---|---|
| `npm ci` | 成功 | 成功 |
| lint(4 ワークスペース) | exit 0 | exit 0 |
| `tsc --noEmit`(asa/yoru/oya/core) | - | 成功(`tsc --version` = 7.0.2) |
| 全テスト | 全件 pass | 全件 pass |
| build(asa・yoru) | 成功 | 成功 |

- **ESLint 10**: Issue の「`getFilename is not a function` で落ちる」は再現しなかった(`eslint-config-next` 16.4.2)。意図的な違反を置いて、lint が実際に検出することも確認した。ただし `eslint-plugin-react` / `import` / `jsx-a11y` の peer 宣言は ESLint 9 まで。peer 範囲外で動いている。ロックファイルが約 +900 行変わる。
- **TypeScript 7**: `typescript-eslint` の peer は `<6.1.0` のまま。lint が通ったのは、`eslint-config-next` 配下の `typescript-eslint` が入れ子の TypeScript 6.0.3 を使うため。型検査・ビルドは 7.0.2 で通る。
- **未実施**: Playwright E2E、CI(Actions)での実行。

## 判断リスト(所要 5 分)

### D1 ESLint 10 を採用するか(#116)
- 質問: ESLint 10 へ上げるか。
- 選択肢:
  - A. 上げる(PR #268 の ESLint 10 の部分だけを取り出して別 PR にし、ready にして CI と E2E を通してからマージ。`dependabot.yml` の `eslint` の `ignore` を外す)。推奨。ESLint 9.39.5 は npm が「サポート終了」と警告しており、検証で動くと分かったため。
  - B. 待つ(プラグインが peer で ESLint 10 を宣言するまで)。peer 範囲外の運用を避けられるが、サポート終了版に居続ける。
  - C. 上げない(Issue を閉じる)。
- 回答欄: [x] A  [ ] B  [ ] C  [ ] その他:(2026-10-19、オーナー回答: 推奨案で可)
- デフォルト: B(何もしない。PR #268 は閉じずに残す)

### D2 TypeScript 7 の扱い(#116)
- 質問: TypeScript 7 に上げるか。
- 選択肢:
  - A. `typescript-eslint` が TS 7 を peer で宣言するまで待つ。推奨。型付き lint が実質 TS 6 で動く状態は、気づかない不整合になりうる。
  - B. 今上げる(型検査・ビルドは通る。lint は入れ子の TS 6 で動く)。
  - C. 上げない。
- 回答欄: [x] A  [ ] B  [ ] C  [ ] その他:(2026-10-19、オーナー回答: 推奨案で可)
- デフォルト: A

### D3 `supabase/` の置き場の統一(#156)
- 質問: ルートの `supabase/` と `apps/yoru/supabase/` を統一するか。
- 選択肢:
  - A. 統一しない(推奨)。工数 0。Issue 本文のとおり、得が小さく、リスクは本番 DB(`db-deploy.yml` の自動適用のパス)にある。
  - B. 統一する。工数は中(ワークフロー 3 本・CI のスタブ・docs の更新と、本番適用の検証)。誤適用のリスクがある。
  - C. 当面見送り、1 年後に再検討。
- 回答欄: [x] A  [ ] B  [ ] C  [ ] その他:(2026-10-19、オーナー回答: 推奨案で可)
- デフォルト: A

### D4 Edge Functions の `pushLogic.ts` の共通化(#156)
- 質問: 2 アプリで同じファイルを使う形にするか。
- 選択肢:
  - A. しない(推奨)。テストが各アプリにあり動いている。`pushCommon.ts` は既に `sync-push-common.mjs` で複製・同期済みで、固有部分だけが別。
  - B. する。工数は中〜大、Edge Function の本番デプロイを伴う。
  - C. 必要が出たときに判断(現状のまま Issue に残す)。
- 回答欄: [x] A  [ ] B  [ ] C  [ ] その他:(2026-10-19、オーナー回答: 推奨案で可)
- デフォルト: C

### D5 実 Supabase E2E のテストプロジェクトを作るか(#117)
- 質問: CI 用のテスト Supabase プロジェクトを用意するか。
- 選択肢:
  - A. 作らない(推奨)。家族 2 人の運用で、実 DB のテストを動かす利益が小さい(RLS の自動検査が既存のテストでどこまで足りているかは未調査)。`defer` のまま。
  - B. 作る。工数は小〜中(プロジェクト作成、`schema.sql` の適用、Secrets 5 つ、`E2E_SUPABASE_ENABLED=true`)。手順は `apps/asa/docs/e2e-supabase.md`。Supabase 無料枠のプロジェクト数の上限を使う。
  - C. 手元の PC だけで 1 回実行して確認する(CI には載せない)。
- 回答欄: [x] A  [ ] B  [ ] C  [ ] その他:(2026-10-19、オーナー回答: 推奨案で可)
- デフォルト: A

### D6 PR #267(#228 の SPEC 修正)をマージしてよいか
- 質問: 内容を確認してマージしてよいか(ドキュメントとテストのみ)。
- 選択肢: A. マージする(推奨) / B. 修正してほしい / C. 閉じる
- 回答欄: [x] A  [ ] B  [ ] C  [ ] その他:(2026-10-19、オーナー回答: 推奨案で可)
- デフォルト: A(マージはしない。私のほうでは何もしない)

### D7 #226 の閉じ方
- 質問: 残りが画面確認 2 件だけの #226 を、いつ閉じるか。
- 選択肢:
  - A. 手動作業 M5・M6 が済んだら閉じる(推奨)。
  - B. 今閉じ、残りは運用 Issue #261 に移す。
  - C. 開いたまま。
- 回答欄: [x] A  [ ] B  [ ] C  [ ] その他:(2026-10-19、オーナー回答: 推奨案で可)
- デフォルト: C

### D8 #237 の扱い(11/1 以降)
- 質問: 枠が戻った後の実測で足りていたら、#237 を閉じてよいか。
- 選択肢: A. 足りていれば閉じる(推奨。10/18 のコメントのとおり) / B. Dependabot を `monthly` にして様子を見る / C. 開いたまま
- 回答欄: [x] A  [ ] B  [ ] C  [ ] その他:(2026-10-19、オーナー回答: 推奨案で可)
- デフォルト: C

## 手動作業(D 分類)

所要時間は目安。SQL は読み取り専用で、`docs/triage/173-verify-readonly.sql` にまとめた(結果に ID が出るため、貼るのは件数だけ)。

- [ ] **M1 Supabase の Redirect URLs を確認する(#228、約 3 分)**: Supabase → Authentication → URL Configuration。Site URL が `https://asa-note.vercel.app`、Redirect URLs に `https://yorunote-mm.vercel.app/**` があるか。無ければ追加。済んだら #228 を閉じてよい。
- [ ] **M2 パートナーへのリリース(#173、約 15 分)**: URL は `https://yorunote-mm.vercel.app`(本文の `asa-note.vercel.app` はあさノート)。ホーム画面に追加 → メールのリンクでログイン → 「共有」タブで通知をオン。
- [ ] **M3 通知の実機確認 2 台(#173、約 10 分)**: パートナーが今夜の記録を保存 → もう 1 台に届く。SQL(1) で `evening_subscriptions` が 2。リマインド(20 時台)が届いた日に、SQL(3) で `reminder_deliveries` にその日の行。
- [ ] **M4 あさノート本番のログアウト確認(#173、約 5 分)**: ログアウト → SQL(2) で `push_subscriptions` が 1 減る → 再ログインして「共有」タブで通知オン → また届く。
- [ ] **M5 Coverage summary の見た目(#226、約 2 分)**: <https://github.com/mmtigers/AsaNote/actions/runs/38393391031> → Summary の「Coverage」の表と折りたたみ。
- [ ] **M6 Dependabot の二重実行(#226、約 5 分)**: Dependabot の PR に `@dependabot rebase` とコメント(または次の月曜 9:00 JST を待つ)→ その PR の `CI` が最後の 1 本だけ success、他が cancelled。
- [ ] **M7 iOS PWA の復帰時の取り込み(#173、約 10 分)**: 2 台で、一方が保存 → もう一方を閉じずに 5 分以上おいて前面に戻す → 新しい記録が出る。
- [ ] **M8 エクスポートの子ども絞り込み(#173、約 5 分)**: 子ども 2 人以上の家庭で、「すべて」「各お子さま」「未分類」、CSV 末尾の「子ども」列、印刷/PDF の見出し。
- [ ] **M9 11/1 以降: Billing の実測(#237、約 5 分)**: Settings → Billing → Actions の使用量をリポジトリ別に見る。private だけで足りるか。足りなければ、クローズ済みの PR を再オープンせず、現状の main から作り直す。
- [ ] **M10 2027 年 9 月ごろ: 旧フィールドの件数(#114、約 5 分)**: `docs/triage/114-legacy-fields-count.sql` を実行。`with_any_legacy` が 0、または許容できる量なら、#114 の削除対象一覧に沿って一括削除の PR を作る。
- [ ] (任意)#173: アーカイブ済み `mmtigers/YoruNote` の README に移行案内を足す(アーカイブ解除が要る。約 10 分)。
- [ ] (D5 で B を選んだ場合)#117: テスト用プロジェクトの作成と Secrets の登録(約 30 分。`apps/asa/docs/e2e-supabase.md`)。
