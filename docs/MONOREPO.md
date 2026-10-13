# モノレポ運用メモ

## 構成と方針

- npm workspaces(`apps/*`)。依存のロックはルートの `package-lock.json` 1つ。
- 共通コードは `packages/core`(`@note/core`)に置く。ビルド不要で、TS のソースをそのまま公開し、Next.js 側が取り込んで変換する
  (Next の Turbopack / webpack は、workspaces のパッケージを自動で変換するので `transpilePackages` は不要)。
  アプリからは `import { ... } from "@note/core/date"` のように、`src/` 配下のパスで取り込む。
  `package.json` の `exports` で公開するのは、`.ts`(`./*`)、`auth.tsx`、UI 部品(`./components/*` は `.tsx`)。
  `.tsx` を足すときは、`exports` に対応するパターンを足すこと。
- `supabase/` は**あさノートのものをルート直下のまま**残している(共有DBの共通表の定義の正。
  `db-deploy.yml` が本番DBへ自動適用するため、パスを変えない)。
  よるノートの `schema.sql` などは `apps/yoru/supabase/`。統合は別フェーズで検討する。
- 端末内データ(localStorage / IndexedDB)のキー名は変えていない。

## CI / DB 反映

| ワークフロー | 対象 | 備考 |
|---|---|---|
| `ci.yml` | あさノート | 共通ジョブ(`_app-ci.yml`)を呼ぶ + あさノート固有の E2E・型ずれの検査 |
| `ci-yoru.yml` | よるノート | 共通ジョブ(`_app-ci.yml`、`check-schema: true`)を呼ぶ + よるノート固有の E2E・型ずれの検査 |
| `_app-ci.yml` | 共通(再利用ワークフロー) | 依存の検査・lint・型・単体テスト・ビルド、更新履歴の検査。`app` で対象アプリを渡す。`working-directory` はアプリ、`npm ci` はルートで実行 |
| `ci-core.yml` | 共通コード | `packages/core` の lint・型検査・テスト |
| `_db-types-check.yml` | 共通(再利用ワークフロー) | 型ずれの検査(素の Postgres 16 へ `schema.sql` を2回適用し、生成した型とコミット済みの型を比べる)。`ci.yml`・`ci-yoru.yml` が、SQL・型定義のパスを入力として渡して呼ぶ。Supabase CLI の版はここの1か所だけ |
| `db-deploy.yml` | あさノート → 本番DB | **変更していない**。`supabase/schema.sql` の変更で自動適用 |
| `db-deploy-yoru.yml` | よるノート → 本番DB | `apps/yoru/supabase/schema.sql` の変更で自動適用。**自分自身のパスはトリガーに含めない**(ワークフローを足しただけで本番へ適用されないように)。適用前に `check-schema-safety` を通す |

**CI の起動条件(#225。Actions の無料枠・月2,000分を守るため)**: `ci.yml`・`ci-yoru.yml`・`ci-core.yml` は、`main` への push では走らせず、`main` への PR だけで走る。さらに `paths` で、そのアプリ(core は `packages/core`)・共通コード・`supabase/`・`scripts/`・`docs/`・ルートの `*.md` と package・`.nvmrc`・`.github/` に関わる変更だけが対象(他方のアプリだけの変更では走らない)。**ドラフトの PR では走らせない**(全ジョブに `if: !github.event.pull_request.draft`。ready にした時と、その後の push で走る)。マージ後の統合ミスは CI では検出しない。`db-deploy*.yml` は本番DBへの反映なので、push のまま。Node の版は `.nvmrc`(ルート)の1か所で、全ワークフローの `setup-node` が読む。

`check-release-notes.mjs` はルートの `scripts/` に1つだけ置き、各アプリの CI が `working-directory` をアプリにして実行する(あさノート・よるノートで共通。テストは `apps/asa/src/lib/releaseNotesCheck.test.ts`)。アプリ単位で動く(変更ファイルはアプリ相対、lock の version はルートの
`package-lock.json` の `packages["apps/<app>"]` を見る)。
`packages/core/src/` の変更は両アプリの画面に影響するため、どちらのアプリの検査でも「ユーザー向けの変更」として扱う(#200)。つまり core を変えたら、あさノート・よるノートの両方で更新履歴と版上げが要る。載せない変更は `[skip release-note]` / `no-release-note` で除外する。

## Vercel の設定(あさノート・本番切り替え時)

プロジェクトの Settings で:

1. **Root Directory** を `apps/asa` にする。
2. **Include source files outside of the Root Directory in the Build Step** を有効のままにする(既定は有効)。
   Phase 1 で `packages/core` を使う時に必須。
3. Install Command は既定(`npm install`。ルートの lock を使う)のままで良い。Build Command も既定。
4. 環境変数・ドメインは変更不要。

### よるノートの Vercel プロジェクト

別プロジェクトで、Root Directory を `apps/yoru` にしている(「ルート外のファイルを含める」も有効)。

| プロジェクト | 本番 URL | つなぐリポジトリ |
|---|---|---|
| あさノート | `go-to-school-one.vercel.app` | `mmtigers/AsaNote`(Root Directory `apps/asa`) |
| よるノート | `asa-note.vercel.app` | `mmtigers/AsaNote`(Root Directory `apps/yoru`) |

- **つなぐリポジトリは、必ず `mmtigers/AsaNote`**(このリポジトリ)にする。2026-10-07 に、アーカイブした旧 `mmtigers/YoruNote` につないだプロジェクトで公開してしまい、#171 以降の版が届かず、`v0.2.0` のまま止まった(実機の更新履歴で発覚)。作ったら、Settings → Git で、つなぎ先のリポジトリを確かめること。
- 環境変数は `NEXT_PUBLIC_SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_ANON_KEY`・`NEXT_PUBLIC_VAPID_PUBLIC_KEY`(Production と Preview)。
- ログインのメールのリンク用に、Supabase の Authentication → URL Configuration の Redirect URLs へ、本番 URL(`https://asa-note.vercel.app/**`)を登録している(Site URL はあさノートのまま)。
- **本番 URL(ドメイン)を変えると、端末に入れた PWA は別のサイト扱いになる**(端末内のデータ・ログイン・通知の登録を引き継げない)。プロジェクト名の変更でドメインが変わりうるので、公開後は変えないこと。

### 切り替えの順序

1. PR のプレビュー(Vercel の Preview)が、Root Directory 変更前は**失敗する**のは想定どおり。
2. 立ち会える時間に、Vercel の Root Directory を `apps/asa` に変更する。
3. **直後に** PR を `main` へマージする(変更〜マージの間に `main` のビルドが走ると、旧構成の `main` が失敗する)。
4. 本番デプロイの成功と、画面・同期の動作を確認する。

ビルドが失敗しても、公開中の本番(直前の成功デプロイ)は置き換わらない(Vercel の通常の挙動)。

### 切り戻し

1. GitHub で、この変更のマージコミットを revert する PR を `main` へ入れる(旧構成に戻る)。
2. Vercel の Root Directory を空(リポジトリのルート)に戻す。
3. 急ぐ場合は、Vercel の Deployments から直前の成功デプロイを **Promote to Production**(即時に戻せる)。

## 共通の設定(tsconfig・ESLint)

- `tsconfig.base.json`(ルート): `apps/asa`・`apps/yoru`・`packages/core` の `tsconfig.json` が `extends` する、型検査の共通の土台。アプリごとに違うもの(`allowJs`・`incremental`・Next のプラグイン・`@/*` のパス・`include`)だけ、各 `tsconfig.json` に残す。
- `eslint.base.mjs`(ルート): 3か所の `eslint.config.mjs` が取り込む、`eslint-config-next` の共通の土台。`ignore` など固有の設定は各 `eslint.config.mjs` に残す。`eslint.config.*` という名前にしないのは、ルートで eslint を動かしたときに自動で拾われないようにするため。
- Vercel のあさノートのプロジェクトは「ルート外のファイルを含める」設定(上記)が有効なので、ルートの `tsconfig.base.json` を `extends` できる。この設定を切ると、ビルドが通らなくなる。
- `vitest.config` / `playwright.config` は、アプリごとに中身が実質違う(対象ファイル・並列数・ポート・ブラウザの扱い)ため、共通化していない。

## 注意

- `next dev` はアプリのディレクトリに `AGENTS.md` / `CLAUDE.md` を自動生成する(内容はルートと同じ)。
  生成物なのでコミットして差し支えない。
- コード中の `#62` などの Issue 番号は、取り込み前のリポジトリでは別々の番号体系だった。
  よるノート側(`apps/yoru`)の番号は、アーカイブした旧 `yorunote` リポジトリの Issue を指す。

## 共通コード(`packages/core`)の方針

- **2つのアプリで同一にしたいものだけ**を移す。先回りの抽象化はしない。アプリ固有のもの(記録フロー・同期・選択肢など)は各アプリに残す。
- アプリ名・文言・localStorage のキー接頭辞などの違いは、引数や設定で渡して吸収する(共通コードの中でアプリを判別しない)。
  - 例: `@note/core/selectedChild` などは `createXxx(appId)` のファクトリで、各アプリの `src/lib/appConfig.ts`(`APP_ID`)を渡して
    アプリ用のインスタンスを作る。アプリ側には薄いラッパー(`src/lib/db/selectedChild.ts` など)を残し、import 元は変えない。
  - キー・イベント名は `${APP_ID}:...` で組み立てる。値は既存と同じ(`asa-note:` / `yoru-note:`)。
  - 例: 認証(`@note/core/auth`)は、クラウド同期の呼び出し(`pullFromCloud` など)をコールバックで受け取る。
    アプリ側の `src/lib/auth/AuthProvider.tsx` が、自分の `sync.ts` の関数(モジュールレベルの安定した関数)を渡す。
  - 例: グループ管理(`@note/core/group/useGroupAdmin`)は、招待の文面に入るアプリ名(`APP_NAME`。`src/lib/appConfig.ts`)と、
    同期の関数(`pullFromCloud`)を引数で受け取る。画面(`app/group/page.tsx`)はアプリに残し、部品とフックは core から使う。
  - アプリごとの値に依存する部分(例: `useEffectiveChildId` は選択中の子ども)は、アプリ側のラッパー(`src/lib/db/children.ts`)に残す。
    各アプリの `src/lib/appStorageKeys.test.ts` が、キー名とイベント名が変わっていないことを固定している(変えると端末の保存済みの値が消える)。
- 端末内データのキー名は変えない(変えるとユーザーの保存済みの状態が消える)。
- **UI 部品は「表示は core、値はアプリ」に分ける**(例: `SyncFailureNotice` は `failing` と `onDismiss` を props で受け取り、
  アプリ側のラッパーが自分の `syncStatus` を渡す)。リリース一覧や同期のように、アプリの値・関数に依存するものは core に直接 import しない。
- **Tailwind のクラスは、core の部品でも CSS に入れる必要がある。** Tailwind はアプリのディレクトリの外(`packages/core`)を自動では走査しないため、
  各アプリの `src/app/globals.css` に `@source "../../../../packages/core/src";` を置いてある(無いと、core へ移した部品のスタイルが本番だけ静かに欠ける。
  ビルドも型検査も通ってしまう)。各アプリの `src/app/globalsCss.test.ts` が、この指定が外れていないことを固定している。
  あわせて `@source not` で core のテストファイルは走査から外している(テスト内の文字、例えば `container.firstChild` が、クラス名と誤解されて余計なスタイルが作られるため)。
  core へ部品を移したら、ビルドした CSS(`.next/static/chunks/*.css`)のルールが移す前と変わらないことを確かめること。
- テストは共通コードの隣に置く(`packages/core/src/**/*.test.ts`)。移したファイルのテストをアプリ側に残さない。
