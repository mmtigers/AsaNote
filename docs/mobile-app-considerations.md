# あさノートのスマホアプリ化:検討事項の洗い出し

- 作成: 2026-11-13(調査のみ。コードは変更していない)
- 対象: `apps/asa`(あさノート)。よるノート(`apps/yoru`)・おやノート(`apps/oya`)への波及も扱う
- 根拠は、リポジトリの実装と `apps/asa/docs/SPEC.md`。ストアの規約・料金は**著者の知識で書いており、最新の情報で確認していない**(「調査が必要なこと」に挙げた)

## 結論の候補(判断はオーナー)

1. **最有力は「B. Capacitor で包む」+「段階的に通知だけネイティブ化」**。画面・同期・Dexie はほぼそのまま使え、packages/core もよるノートと共有し続けられる。ただし、Apple の審査で「Web を包んだだけ」と見なされない工夫と、ログイン・通知・端末内データの3点の作り直しは避けられない。
2. 目的が「iPhone で通知を確実に届けたい」「ホーム画面に置いてほしい」だけなら、**A. PWA の改善で足りる可能性**がある(iOS 16.4 以降はホーム画面の PWA で Web Push が届く。今の実装もそれ前提)。
3. **C. ネイティブで作り直す**のは、今の規模(個人開発・家族向け)では割に合わない見込み。

## 現状の要点(アプリ化に効くもの)

| 項目 | 現状 | 根拠 |
|---|---|---|
| 形態 | Next.js 16(App Router)の PWA。Vercel で公開。`display: standalone`・縦向き | `apps/asa/public/manifest.webmanifest`, SPEC §8.1 |
| サーバー依存 | **サーバー側の処理がほぼ無い**。Route Handler は `releases.json` のみで `force-static`。Server Actions・`cookies()`・proxy(middleware)なし | `apps/asa/src/app/releases.json/route.ts`, `apps/asa/next.config.ts` |
| データ | 記録は IndexedDB(Dexie `asa-note-db`)が先、Supabase へ同期。下書き等は localStorage | `apps/asa/src/lib/db/localDb.ts`, SPEC §5.3・§7 |
| ログイン | メールのマジックリンクのみ。戻り先は `window.location.origin`。コードの手入力 UI は無い。Supabase のクライアントは既定の設定(セッションは localStorage) | `packages/core/src/components/LoginView.tsx`, `packages/core/src/supabase/client.ts`, SPEC §3.6 |
| 通知 | Web Push(VAPID)。Service Worker が受信。送信は Edge Function 3つ(`send-reminders` / `notify-partner` / `notify-comment`)と `pg_cron`・DB トリガー。**手動デプロイ** | `apps/asa/public/sw.js`, `apps/asa/src/lib/push.ts`, `supabase/functions/`, `apps/asa/docs/push-notifications-setup.md` |
| オフライン | 手書きの Service Worker でアプリシェルをキャッシュ。初回直後のオフライン起動は未検証(Q15) | `apps/asa/public/sw.js`, SPEC §7.7 |
| 更新 | `main` へのマージで Vercel に即時反映。`releases.ts` と version を CI が強制 | `scripts/check-release-notes.mjs`, `apps/asa/src/data/releases.ts` |
| 退会 | **アカウント・データ削除の機能が無い**(Q13) | SPEC §6.5 |
| 利用範囲 | 家族内の限定運用か一般公開か未確定(Q13) | SPEC §1.2 |
| 共通化 | よるノート・おやノートも同じ構成(各 `public/sw.js`・`manifest.webmanifest`)。共通部品は `packages/core` | `apps/yoru/public`, `apps/oya/public`, `docs/MONOREPO.md` |

---

## 1. 目的の整理

| 論点 | 現状と根拠 | 影響 | 判断に必要な情報 |
|---|---|---|---|
| 何を解決したいか | 今の PWA で、記録・共有・Push・オフラインはすでに動く(SPEC §1.3, §4)。アプリ化で新しく得られるのは主に「ストアで見つかる・入れやすい」「iOS でホーム画面への追加という手順が要らない」「通知が確実に届きやすい」「ウィジェットなどネイティブの機能」 | 高 | オーナーが一番困っていること(下の確認事項 Q1) |
| PWA で解決できるものとの切り分け | iOS の Push はホーム画面の PWA なら届く(`push-notifications-setup.md`)。「ホーム画面への追加」の案内を改善するだけで足りる可能性 | 高 | 利用者がホーム画面に追加できず困った実例があるか |
| 利用者の範囲 | 家族内の限定運用ならストア公開は過剰。TestFlight / Google Play の内部テストで配る手もある(Q13) | 高 | 一般公開する予定の有無 |

## 2. 実現方式の比較

| 観点 | A. PWA を改善 | B. Capacitor で包む(Android は TWA も可) | C. React Native / Expo で作り直す |
|---|---|---|---|
| 開発量 | 小 | 中(ログイン・通知・移行・ストア対応) | 大(画面をすべて作り直す) |
| packages/core の再利用 | そのまま | ほぼそのまま。`next build` を静的出力(`output: "export"`)にできる見込み(サーバー依存がほぼ無いため) | ロジック(`date.ts`・`cloudSync.ts` 等)の一部のみ。UI(`components/*.tsx`)は使えない |
| よるノートへの横展開 | 不要 | 同じ手順で可能 | アプリごとに作り直し |
| 保守負担 | 今と同じ | Web + iOS/Android のネイティブ設定・SDK の版上げが増える | 最大(Web 版と二重管理になる) |
| ストア審査 | なし | Apple の「最低限の機能」(Guideline 4.2)で、Web を包んだだけと見なされる恐れ。ネイティブの通知・ウィジェット等で差をつける必要 | 通りやすい |
| 更新の速さ | 即時 | 画面は即時(Web から読む方式なら)/ストア審査(同梱する方式なら) | ストア審査(または OTA 更新) |
| 端末内データ | 影響なし | **WebView は別の保存先になり、今の IndexedDB は引き継げない**(§5) | 同左 |

- B の中でも「本番 URL を WebView で開くだけ」か「ビルド結果をアプリに同梱する」かで、審査・オフライン・更新の性質が大きく変わる。審査と CSP(`X-Frame-Options: DENY` は WebView 直開きでは問題にならないが、`packages/core/src/csp.ts` の `connect-src` などは同梱時の origin `capacitor://localhost` を想定していない)の両面で、**同梱方式が本命**。
- Android だけなら TWA(Bubblewrap / PWABuilder)で、今の PWA をほぼそのままストアに出せる。iOS は TWA が無いので Capacitor 等が要る。

## 3. ストア審査・規約

| 論点 | 現状と根拠 | 影響 | 判断に必要な情報 |
|---|---|---|---|
| Web を包んだだけと見なされる問題 | 画面はすべて Web。ネイティブ機能は今は無い | 高 | ネイティブの通知・ローカル通知・ウィジェット等をどこまで入れるか |
| **アカウント削除が必須** | アカウントを作れるアプリは、アプリ内から削除できる必要がある(Apple 5.1.1(v)、Google Play も同様)。**今は退会機能が無い**(SPEC §6.5, Q13)。`records`・`children` などは `auth.users` の削除で連鎖して消える定義だが、グループ・計測(`analytics_events`)・`client_errors` の扱いを決める必要がある(`supabase/schema.sql`) | 高 | 削除時にパートナーとの共有記録をどうするか |
| プライバシー表示 | App Privacy(Apple)・データセーフティ(Google)に、メール・記録内容(子どもの様子のメモ)・計測・エラー記録の収集を正しく書く必要(SPEC §6.5, §11) | 中 | プライバシーポリシーの公開 URL |
| 子どもに関する情報 | 利用者は保護者なので「キッズ」カテゴリには当たらないが、メモに子どもの心身の様子が入りうる(SPEC §6.5)。年齢区分の質問票・個人情報保護法上の要配慮情報に近い扱いを検討 | 中 | 一般公開時の利用規約・ポリシーの方針 |
| 外部フォント | Google Fonts を外部取得(Q18)。プライバシー表示で第三者への送信として扱うか、同梱に切り替えるか | 低 | — |

## 4. ログイン

| 論点 | 現状と根拠 | 影響 | 判断に必要な情報 |
|---|---|---|---|
| メールのリンクがアプリに戻らない | `emailRedirectTo: window.location.origin`(`packages/core/src/components/LoginView.tsx`)。アプリ内では origin が `capacitor://localhost` / `https://localhost` になり、メールのリンクは**ブラウザで開く**ため、アプリにログインできない | 高 | Universal Links / App Links を使うか、確認コード方式に切り替えるか |
| 確認コード方式(OTP)への切り替え | Supabase は同じメールに6桁のコードを載せられる(`verifyOtp`)。入力 UI を追加すれば、リンクの戻り先の問題を回避できる。`otpCooldown.ts` はそのまま使える。**よるノートも同じ `LoginView` を使うので、core の変更は両アプリに効く** | 高 | メールの文面(テンプレート)を変えてよいか |
| Universal Links / App Links | 使うなら `apple-app-site-association` / `assetlinks.json` を `asa-note.vercel.app` に置き、Supabase の Redirect URLs にも登録(SPEC §8.5, `docs/MONOREPO.md`)。Site URL があさノートで、よるノートは Redirect URLs に依存している点に注意 | 中 | 独自ドメインを取るか |
| セッションの保存先 | Supabase のセッションは WebView の localStorage。OS がストレージを消すことがある(特に iOS)。Capacitor Preferences 等への保存を検討 | 中 | — |
| PWA とアプリの二重ログイン | 同じ端末で PWA とアプリは別のセッションになる。購読(`push_subscriptions`)も別々にでき、通知が二重に届きうる(§6) | 中 | 移行期間に PWA を残すか |

## 5. 端末内データの移行(最大の落とし穴の1つ)

| 論点 | 現状と根拠 | 影響 | 判断に必要な情報 |
|---|---|---|---|
| PWA の IndexedDB はアプリから見えない | 保存先はブラウザ(Safari / Chrome)の origin ごと。アプリの WebView とは別(SPEC §5.3) | 高 | 今の利用者の数と、ログインしているか |
| ログイン済みの利用者 | 記録はクラウドにあるので、アプリでログインすれば `pull` で戻る(SPEC §7.3)。**ただし PWA 側に未送信(`pending`)の記録・削除キューが残っていると失われる** | 高 | — |
| **未ログインの利用者** | 記録は端末内だけ(SPEC §3.6「未ログインの利用」)。アプリへ移ると**全部消えたように見える** | 高 | 未ログインの利用者がいるか |
| 下書き・設定 | `asa-note:draft` 等の localStorage も引き継げない(SPEC §5.3)。下書きは失っても影響小 | 低 | — |
| 移行の手当て案 | (1) PWA に「アプリへ移る前にログインして同期」の案内を出す、(2) 未送信件数を表示(`countUnsyncedChanges` が既にある)、(3) 未ログインでも使えるエクスポート/インポート(CSV は出力のみで取り込みが無い。`apps/asa/src/app/export/`) | 中 | — |

## 6. 通知

| 論点 | 現状と根拠 | 影響 | 判断に必要な情報 |
|---|---|---|---|
| WebView では Web Push が使えない | iOS の WKWebView は Service Worker・Push API に対応しない。`isPushSupported()` が false になり「対応していません」と出る(`apps/asa/src/lib/push.ts`, SPEC §4.2) | 高 | — |
| APNs / FCM への切り替え | Capacitor の Push プラグインで端末トークンを取り、FCM(iOS は APNs 経由)で送る。必要な作業:`push_subscriptions` に種別(web / ios / android)とトークンの列を足す(`supabase/schema.sql`、**main マージで本番に自動適用**・`npm run db:types` も)、`supabase/functions/_shared/pushLogic.ts` の送信を分岐、APNs の鍵・Firebase の設定をシークレットに追加(手動デプロイ) | 高 | Firebase を使ってよいか |
| 通知のタップでの遷移 | 今は Service Worker の `notificationclick` で `url` に遷移(`public/sw.js`)。アプリではプラグインのイベントで同等の処理が要る | 中 | — |
| 二重通知 | 同じ人が PWA とアプリの両方で購読すると、両方に届く(送信は「全購読へ」SPEC §4.3)。ログアウトでの購読解除(SPEC §3.6)はアプリ側でも作り直す必要 | 中 | 移行期間の方針 |
| ローカル通知という選択肢 | 「未入力日のリマインド」は端末のローカル通知でも実現できる(サーバー不要)。ただし「家族の誰かが記録済みなら送らない」判定(SPEC §4.3 の 2.)はサーバー側の情報が要る | 低 | — |

## 7. オフライン・同期

| 論点 | 現状と根拠 | 影響 | 判断に必要な情報 |
|---|---|---|---|
| Service Worker の役割の置き換え | 同梱方式なら、画面はアプリ内にあるので、シェルのキャッシュ(`public/sw.js`)は不要。初回直後のオフライン起動の問題(Q15)も解消する | 中 | 同梱方式にするか |
| WebView でも Dexie は動く | IndexedDB は WKWebView / Android WebView で使える。同期(`apps/asa/src/lib/db/sync.ts`、`packages/core/src/cloudSync.ts`)はそのまま | 低 | — |
| 前面に戻ったときの pull | `visibilitychange` 頼み(`packages/core/src/pullOnResume.ts`)。アプリでは Capacitor の `appStateChange` の方が確実な場合がある | 低 | — |
| ストレージの消去 | iOS は空き容量が少ないと WebView のデータを消すことがある。未送信の記録が消える恐れ | 中 | — |

## 8. 更新の届け方(最大の落とし穴のもう1つ)

| 論点 | 現状と根拠 | 影響 | 判断に必要な情報 |
|---|---|---|---|
| 即時反映から審査待ちへ | 今は main へのマージで即時に反映(Vercel)。同梱方式では、画面の変更もストア審査(数時間〜数日)を経る | 高 | 更新の頻度(今は頻繁に版を上げている:`releases.ts`) |
| 版の二重管理 | `releases.ts`・`package.json` の version(CI で強制。`scripts/check-release-notes.mjs`)と、ストアのバージョン/ビルド番号の対応をどう取るか。アプリの版が古い利用者が残るので、**サーバー(DB)の変更は古いアプリでも壊れないこと**が前提になる(今は Web なので全員が最新版) | 高 | — |
| OTA 更新(Web の中身だけ差し替え) | Capacitor の Live Update 系(Capgo / Ionic Appflow 等)で、JS・HTML だけを審査なしで差し替えられる。Apple の規約上、アプリの主な目的を変えない範囲なら認められているとされるが、**要確認** | 中 | 有料サービスを使ってよいか |
| 「更新しました」の通知 | `ReleaseNotice` は Web の版を基準にしている(SPEC §3.7)。ストアの更新を促す仕組み(強制アップデート)を足すか | 低 | — |

## 9. モノレポ・CI への影響

| 論点 | 現状と根拠 | 影響 | 判断に必要な情報 |
|---|---|---|---|
| どこに置くか | `apps/asa` に `ios/`・`android/` を足す、または `apps/asa-mobile` を新設。npm workspaces(`apps/*`)の扱い・`docs/MONOREPO.md` の更新 | 中 | — |
| 静的出力 | `output: "export"` にすると `next.config.ts` の `headers()`(CSP 等)が効かなくなる。Vercel 用のビルドと分ける必要 | 中 | — |
| CI の費用 | iOS のビルドは macOS ランナーで、無料枠の**10倍の速さで分を消費**する(Actions の無料枠は月2,000分。`docs/MONOREPO.md` #225)。ストア向けのビルドは手元の Mac か EAS / Codemagic 等の外部サービスで行う方が現実的 | 高 | 手元に Mac があるか |
| 署名の鍵・証明書 | Apple の証明書・プロビジョニングプロファイル、Android のアップロード鍵の保管。紛失すると Android は更新できなくなる | 中 | 保管場所(パスワード管理ツール等) |
| verify.steps / CI の更新 | ネイティブ部分のビルド・lint を CI に足すなら `.claude/verify.steps` も同じ順で更新(CLAUDE.md) | 低 | — |

## 10. 費用と体制

| 項目 | 内容(要最新確認) | 影響 |
|---|---|---|
| Apple Developer Program | 年額(米国では 99 ドル/年。日本の円価格は要確認)。毎年かかる | 中 |
| Google Play デベロッパー | 初回のみ(25 ドル)。**個人の新規アカウントは、公開前に一定人数・一定期間のクローズドテストが必要**(人数・日数は要確認) | 中 |
| Mac | iOS アプリのビルド・提出に Xcode が要る(外部のビルドサービスで代替可能) | 高 |
| 実機 | iPhone / Android の実機での確認(通知・ログインは実機でしか確かめられない) | 中 |
| 保守 | iOS / Android の年1回の大きな更新、SDK の版上げ要求(Google Play の targetSdk の期限など)への対応が毎年発生 | 高 |

## 11. よるノート・おやノートへの波及

| 論点 | 現状と根拠 | 影響 | 判断に必要な情報 |
|---|---|---|---|
| 同じ方式で横展開するか | 3アプリとも同じ構成(`apps/*/public/sw.js`)。ログイン(`LoginView`)・SW 登録(`ServiceWorkerRegister`)は core にあるので、**core を変えると全アプリに効く**(CLAUDE.md の横展開ルール、`docs/MONOREPO.md`) | 高 | よるノートもアプリにするか |
| 1つのアプリにまとめるか | あさノート・よるノートは同じ Supabase プロジェクト・同じアカウント(`docs/MONOREPO.md`)。1つのアプリにタブでまとめれば、審査・費用・通知の基盤が1回で済む。おやノートは別 DB | 中 | ブランドを分けたいか |
| core の変更の版上げ | core を変えると両アプリで `releases.ts` と version の更新が要る(`docs/MONOREPO.md` #200) | 低 | — |

## 12. 法務・運用

| 論点 | 現状と根拠 | 影響 | 判断に必要な情報 |
|---|---|---|---|
| プライバシーポリシー | ストア提出に公開 URL が必須。今はアプリ内・リポジトリに無い(SPEC §6.5 に方針の材料はある) | 高 | — |
| 利用規約・問い合わせ窓口 | ストアのサポート URL・連絡先が必要。個人名・住所の表示の扱い(Apple は個人開発者だと本名が表示される) | 中 | 個人名で出してよいか |
| 掲載素材 | 画面写真(端末サイズ別)、説明文、アイコン(`public/icons/` の流用可) | 低 | — |
| データの保持期間 | 記録本体の保持期間が未定(Q13)。プライバシーポリシーに書く必要 | 中 | — |

---

## オーナーに確認したいこと(優先度順)

1. **アプリ化で一番解決したいことは何ですか?**
   (a) ストアで見つけてもらう・入れやすくする/(b) iPhone のホーム画面追加の手間をなくす/(c) 通知を確実に届けたい/(d) ウィジェット等ネイティブの機能を使いたい/(e) その他
2. **一般に公開しますか、家族・知人だけで使いますか?**(Q13)
   (a) 一般公開/(b) 知人数家族まで(TestFlight・内部テストで配布)/(c) 自分の家族だけ
3. **アカウント削除(退会)のとき、パートナーと共有していた自分の記録はどうしますか?**(ストア公開なら必須)
   (a) すべて消す/(b) グループに匿名で残す/(c) 削除前にエクスポートを促してから消す
4. **ログインを確認コード(6桁)の入力に変えてもよいですか?** よるノートにも同時に効きます。
   (a) コード方式に変える/(b) リンクとコードの両方/(c) リンクのまま Universal Links で対応
5. **今、未ログインのまま使っている利用者はいますか?**(いると移行で記録が消えたように見える)
   (a) いない/(b) いる・案内してログインしてもらう/(c) 分からない
6. **画面の更新が審査待ちになっても構いませんか?**
   (a) 構わない(同梱して審査)/(b) 即時更新を残したい(OTA の有料サービスを検討)/(c) 本番 URL を WebView で開くだけにしたい(審査リスクを承知)
7. **手元に Mac と iPhone はありますか?**
   (a) 両方ある/(b) iPhone だけ/(c) どちらも無い(Android から始める)
8. **よるノートも同時にアプリにしますか?**
   (a) あさノートだけ先に/(b) 両方を別々のアプリに/(c) 1つのアプリにまとめる
9. **年額の費用(Apple)と、外部サービス(Firebase・ビルドサービス・OTA)を使ってよいですか?**
   (a) 無料のものだけ/(b) Apple の年額までは可/(c) 必要なら有料サービスも可
10. **ストアに表示される開発者名(個人名)は問題ありませんか?**
    (a) 問題ない/(b) 避けたい(法人・屋号を検討)

## 調査が必要なこと(最新の情報で確認)

今回は Web で調べていない。以下は著者の知識に基づくので、判断の前に公式の情報で確かめること。

| 事項 | 確認先 |
|---|---|
| App Store Review Guidelines 4.2(最低限の機能)の現行の運用と、Web ラッパーアプリの却下の傾向 | Apple の App Store Review Guidelines |
| 5.1.1(v) アカウント削除の要件(アプリ内からの削除、Web での削除で足りるか) | 同上、Apple Developer の「アカウント削除」の案内 |
| 3.3.x / 4.7 と、JS の OTA 更新が認められる範囲 | 同上 |
| Google Play の個人デベロッパーのクローズドテスト要件(人数・日数)と、アカウント削除の要件(Web の削除ページも必須か) | Play Console ヘルプ |
| Apple Developer Program の日本の価格、Google Play の登録料 | 各公式サイト |
| iOS の PWA(ホーム画面の Web アプリ)の Push の現状と制約、日本のスマホ新法による代替ストア・ブラウザエンジンの動向 | Apple / WebKit のリリースノート、公正取引委員会 |
| Capacitor の現行版と、Next.js 16 の `output: "export"` の制約(このリポジトリの Next は一般的な知識と異なる。`node_modules/next/dist/docs/` を読む) | Capacitor 公式、`node_modules/next/dist/docs/` |
| Supabase Auth の OTP(メールのコード)とメールテンプレートの設定、ネイティブアプリでのディープリンク | Supabase 公式ドキュメント |

## 次の一歩(判断材料をそろえるため)

1. **オーナーが上の確認事項 1・2・3 に答える**。目的と公開範囲で方式がほぼ決まる(家族だけなら A で十分な可能性が高い)。
2. **Capacitor の試作を1日で作る(Android から)**。`output: "export"` でビルドが通るか、Dexie・同期が WebView で動くか、ログインが戻ってこない問題がどう出るかを確かめる。コードは別ブランチに置き、main には入れない。
3. **ストアの有無に関係なく必要なものを先に進める**:確認コードでのログイン(core)、退会機能、プライバシーポリシー。どれも PWA のままでも価値がある。
