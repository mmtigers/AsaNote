# 実SupabaseテストプロジェクトでのE2E(Issue #117)

グループ作成 → 招待コード発行 → 別ユーザーで参加 → 脱退 を、**テスト専用のSupabaseプロジェクト**に対して通しで確かめるE2E。
認証経路(ログイン済みセッションでの操作)と RLS(未ログイン・グループ外・脱退後のユーザーから見えない/書けない)の検証を含む。

状態: **未稼働**。コードとCIは準備済みだが、次の3つがまだ(下の「用意する手順」。ユーザーの作業)。

- [ ] テスト専用のSupabaseプロジェクトを作り、`supabase/schema.sql` を適用し、テストユーザーを2人作る(手順1〜4)
- [ ] GitHub の Secrets を登録する(手順5)
- [ ] リポジトリ変数 `E2E_SUPABASE_ENABLED` = `true` を足して有効にする(手順6)

稼働するまで、CI の「E2E test (real Supabase test project)」は **skipped** と表示される(実行されていない。緑の成功ではない。見分け方は「CI の表示の見分け方」)。
テストを手元で実行して Secrets 相当の環境変数が無いときは、テストが自動で skip され、赤くならない。

## 絶対のルール: 本番Supabaseには接続しない

このE2Eは実データを作成・削除する。**本番のプロジェクトのURL・キー・ユーザーを、ここに設定してはいけない。**
うっかり設定しても被害が出ないよう、テスト側に次のガードがある(`e2e-supabase/config.ts`、単体テストあり)。
どれかに当たると、skip ではなく**例外で中止(失敗)**する。

| ガード | 内容 |
| --- | --- |
| 本番URLとの一致 | `E2E_SUPABASE_URL` が、`E2E_PRODUCTION_SUPABASE_URL`(カンマ区切りで複数可)・シェルの `NEXT_PUBLIC_SUPABASE_URL`・`apps/asa/.env.local` の `NEXT_PUBLIC_SUPABASE_URL` のどれかと一致したら中止 |
| ダミー/非https | `placeholder.supabase.co`、https でないURL(ローカルSupabaseの localhost / 127.0.0.1 は可)は中止 |
| キーの取り違え | anon key の欄に service role key(JWTの `role` が `service_role`)や `sb_secret_` を入れたら中止。**service role key はこのE2Eでは使わない** |
| テストユーザー限定 | `E2E_USER_A_EMAIL` / `E2E_USER_B_EMAIL` のローカル部が `asanote-e2e-` で始まらなければ中止。AとBが同一でも中止 |

推奨: 本番のURLを GitHub Secret `E2E_PRODUCTION_SUPABASE_URL` にも入れておく(任意。入れると一致を機械的に検出できる)。
ガードは「うっかり」を防ぐもので、テスト用でないプロジェクトを `asanote-e2e-` のユーザーごと用意されたら防げない。**テスト専用プロジェクトを別に作る**こと。

## テストが何をするか

`e2e-supabase/group-flow.spec.ts`(2テスト、直列実行)。

1. 未ログイン(anon)では `groups` / `group_members` / `group_invites` が空で返り、`create_group()` と `redeem_group_invite()` が失敗する。
2. ユーザーAがログイン済みの状態で `/group` を開き「グループを作る」→ 招待コードが自動発行される。
3. グループ外のBからは、Aのグループも招待コードもRLSで見えない。
4. 別のブラウザコンテキストのBが、コードを入力して「参加する」→ 双方のメンバー一覧に2人が出る。
5. Bは他人(A)の所属を消せない。使用済みコードは `invite_invalid` で再利用できない。
6. Bが「グループを抜ける」(確認ダイアログ)→ Bはグループのデータを読めず、招待を経ない直接INSERTもRLSで拒否される。Aの一覧はAだけに戻る。
7. 最後にAも抜けてグループを空にする。

ログインは、Node側で `signInWithPassword` したセッションをブラウザの localStorage(`sb-<プロジェクトref>-auth-token`)に入れて再現する
(マジックリンクはメールを受け取れないため使わない。パスワードログインはこのE2Eのためだけにテストプロジェクトで使い、アプリ本体の仕様は変えていない)。
失敗してもしなくても、終了時(`afterAll`)にAとBをグループから外す。

## 用意する手順(ユーザーが一度だけ行う)

### 1. テスト専用のSupabaseプロジェクトを作る

Supabaseダッシュボードで新規プロジェクトを作る(名前は例: `asanote-e2e-test`)。**本番とは別プロジェクト**。
Project Settings → API から次の2つを控える。

- Project URL(例 `https://xxxxxxxx.supabase.co`)
- `anon` `public` key(**service_role は使わない・控えない**)

### 2. `supabase/schema.sql` を適用する

次のどちらか。

- SQL Editor に `supabase/schema.sql` の中身を貼って実行する(冪等。何度流してもよい)。
- または `psql "<テストプロジェクトの Session pooler 接続文字列>" --set ON_ERROR_STOP=1 --single-transaction --file supabase/schema.sql`(`db-deploy.yml` と同じ要領。**接続文字列が本番のものでないことを必ず確認**)。

`schema.sql` を変更したら、テストプロジェクトにも流し直すこと(本番と違い、自動では反映されない。`db-deploy.yml` は本番専用で、テストプロジェクトには触れない)。

### 3. Auth を設定する

- Authentication → Providers で **Email** が有効であること(既定で有効)。
- E2Eはパスワードでログインするため、メールの「Confirm email」設定にかかわらず、次の手順で作るユーザーを **Auto Confirm** で作る。
- マジックリンクのSite URL / Redirect URLs(§8.5)は、このE2Eでは使わないので不要。

### 4. テストユーザーを2人作る

Authentication → Users → **Add user → Create new user** で、次の2人を作る。**「Auto Confirm User」にチェック**を入れる。

| 用途 | メールアドレス(例) | パスワード |
| --- | --- | --- |
| ユーザーA | `asanote-e2e-a@example.com` | 推測されにくいもの(このE2E専用) |
| ユーザーB | `asanote-e2e-b@example.com` | 同上(Aと別) |

メールアドレスのローカル部は**必ず `asanote-e2e-` で始める**(ガードの条件。後始末の目印にもなる)。実在するメールである必要は無い。

### 5. GitHub Secrets を登録する

リポジトリの Settings → Secrets and variables → Actions → New repository secret。

| Secret | 値 |
| --- | --- |
| `E2E_SUPABASE_URL` | 手順1のProject URL |
| `E2E_SUPABASE_ANON_KEY` | 手順1のanon key |
| `E2E_USER_A_EMAIL` / `E2E_USER_A_PASSWORD` | ユーザーA |
| `E2E_USER_B_EMAIL` / `E2E_USER_B_PASSWORD` | ユーザーB |
| `E2E_PRODUCTION_SUPABASE_URL`(任意) | **本番**のProject URL(誤接続の検出用) |

6つ(必須)が全部揃っていないと、E2E は実行されない(警告つきの成功で終わる)。**Secrets を登録しただけでは、ジョブは起動しない。次の手順6が要る。**

### 6. リポジトリ変数 `E2E_SUPABASE_ENABLED` を足して有効にする

Settings → Secrets and variables → Actions → **Variables** タブ → New repository variable(Secrets タブではない)。

| Variable | 値 |
| --- | --- |
| `E2E_SUPABASE_ENABLED` | `true` |

この変数が `true` でない間は、ジョブごと起動しない(skipped)。無効に戻したいときは、値を `true` 以外にするか、変数を削除する。

### 7. 初回の動作確認

Actions タブ → 「E2E (実Supabaseテストプロジェクト)」→ Run workflow(`workflow_dispatch`)で手動実行する。
「Run E2E tests against the Supabase test project」ステップが**実行され**、成功すれば稼働している(見分け方は「CI の表示の見分け方」)。
赤くなった場合は、Playwright のレポート(`playwright-report-supabase`、7日保存)を見る。「既知の限界」のとおり、初回はロケータや RLS の期待値の微調整が要るかもしれない。

## 実行のしかた

### CI

`.github/workflows/e2e-supabase.yml`(通常のCI `ci.yml` とは別ワークフロー)。`main` への push、`main` 向けのPR、手動実行(workflow_dispatch)で動く。

- リポジトリ変数 `E2E_SUPABASE_ENABLED` が `true` でない間は、ジョブごと起動しない(skipped。Actions の分数を消費しない。#209)。テスト専用プロジェクトと Secrets を用意したら、Settings > Secrets and variables > Actions > **Variables** に `E2E_SUPABASE_ENABLED` = `true` を追加して有効にする。
- 有効なのに Secrets 未設定 → 判定ステップが `::warning::` と job summary(「実Supabase E2E は未実行」)を出し、以降を飛ばして成功で終わる。緑でも実DBでは検証されていない(#198)。
- fork のPR → Secrets が渡されないので同様に skip。`pull_request_target` は使わない(fork のコードを Secrets 付きで動かさないため)。
- 同じテストユーザーを共有するため、実行は同時に1つだけ(`concurrency`、打ち切りなし)。
- トレース・スクリーンショットは取らない(ログイン済みセッションのトークンを含むため)。失敗時はHTMLレポートのみ7日保存。

初回の動作確認は、手順6までを済ませたあと、Actions タブからこのワークフローを手動実行(Run workflow)するのが早い(手順7)。

### CI の表示の見分け方(#198)

「E2E test (real Supabase test project)」の表示で、実DBで検証されたかどうかが分かる。**緑でも、検証されたとは限らない。**

| 表示 | 意味 |
| --- | --- |
| **skipped**(灰色、ジョブが実行されない) | 変数 `E2E_SUPABASE_ENABLED` が `true` でない。**未稼働**(現在の状態) |
| 成功 + 警告「実SupabaseのE2Eは実行されていません(未設定のSecrets: …)」+ job summary「実Supabase E2E は未実行(skip)」 | 変数は有効だが、Secrets が欠けている、または fork の PR。**実DBでは検証されていない** |
| 成功 + 「Run E2E tests against the Supabase test project」ステップが実行されている(数十秒〜数分かかる) | 実際に実行され、通った |
| 失敗 | 実行されて落ちた。Playwright のレポートを見る |

### ローカル

```bash
cd apps/asa
export E2E_SUPABASE_URL=https://xxxxxxxx.supabase.co   # テストプロジェクト
export E2E_SUPABASE_ANON_KEY=...
export E2E_USER_A_EMAIL=asanote-e2e-a@example.com E2E_USER_A_PASSWORD=...
export E2E_USER_B_EMAIL=asanote-e2e-b@example.com E2E_USER_B_PASSWORD=...
npm run test:e2e:supabase
```

未設定のまま実行すると、未設定の変数名を表示して全テストを skip する(devサーバーも起動しない)。
通常の `npm run test:e2e`(ダミーURLでログイン不要の範囲)には影響しない。ポートも別(3100)。

## テストデータと後始末

- **識別**: グループ・招待コードには名前を付けられないため、**作成者(`created_by`)が `asanote-e2e-` のテストユーザー**であることで識別する。このE2Eは子どもなど名前を付けられるデータは作らない。
- **自動**: テストは終了時に、AとBを `group_members` から外す(RLS上、本人の行は本人が消せる)。
- **手動(空グループの掃除)**: 全員が抜けたグループと招待コードは残る。テストプロジェクトの SQL Editor で、次を実行して消す。

```sql
-- 対象の確認(テストユーザーが作ったグループ)
select g.id, u.email, g.created_at
from groups g join auth.users u on u.id = g.created_by
where u.email like 'asanote-e2e-%';

-- 空グループと期限切れ招待コードの掃除(docs/group-cleanup.md と同じ関数)
select * from cleanup_empty_groups_and_invites();
```

  テストプロジェクトに pg_cron を登録する(`supabase/cron-cleanup-groups.sql`)と自動で掃除される。空グループは動作に影響しない(ユーザーは毎回まっさらな状態から始める)ので、登録は必須ではない。
- **全部消したいとき**: Authentication → Users でテストユーザーを削除すると、`group_members` は `on delete cascade` で消える。

## 既知の限界

- 実プロジェクトでの実行は未検証(このE2Eを書いた環境からは実Supabaseに接続できなかった)。初回実行で、ロケータや RLS の期待値(空配列が返るのかエラーなのか等)の微調整が要るかもしれない。
- プロジェクトの URL がカスタムドメインの場合、localStorage のキー(`sb-<ref>-auth-token`)の推測が外れる。
- ガードは誤設定を防ぐもので、テスト用でないプロジェクトを意図的に指定することまでは防げない。
