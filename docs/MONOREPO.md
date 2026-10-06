# モノレポ運用メモ

## 構成と方針

- npm workspaces(`apps/*`)。依存のロックはルートの `package-lock.json` 1つ。
- 共通コードは `packages/core`(`@note/core`)に置く。ビルド不要で、TS のソースをそのまま公開し、Next.js 側が取り込んで変換する
  (Next の Turbopack / webpack は、workspaces のパッケージを自動で変換するので `transpilePackages` は不要)。
  アプリからは `import { ... } from "@note/core/date"` のように、`src/` 配下のパスで取り込む。
- `supabase/` は**あさノートのものをルート直下のまま**残している(共有DBの共通表の定義の正。
  `db-deploy.yml` が本番DBへ自動適用するため、パスを変えない)。
  よるノートの `schema.sql` などは `apps/yoru/supabase/`。統合は別フェーズで検討する。
- 端末内データ(localStorage / IndexedDB)のキー名は変えていない。

## CI / DB 反映

| ワークフロー | 対象 | 備考 |
|---|---|---|
| `ci.yml` | あさノート | `working-directory: apps/asa`。`npm ci` はルートで実行 |
| `ci-yoru.yml` | よるノート | 同上(`apps/yoru`) |
| `ci-core.yml` | 共通コード | `packages/core` の lint・型検査・テスト |
| `db-deploy.yml` | あさノート → 本番DB | **変更していない**。`supabase/schema.sql` の変更で自動適用 |
| `db-deploy-yoru.yml` | よるノート → 本番DB | `apps/yoru/supabase/schema.sql` の変更で自動適用。**自分自身のパスはトリガーに含めない**(ワークフローを足しただけで本番へ適用されないように)。適用前に `check-schema-safety` を通す |

`check-release-notes.mjs` はアプリ単位で動く(変更ファイルはアプリ相対、lock の version はルートの
`package-lock.json` の `packages["apps/<app>"]` を見る)。

## Vercel の設定(あさノート・本番切り替え時)

プロジェクトの Settings で:

1. **Root Directory** を `apps/asa` にする。
2. **Include source files outside of the Root Directory in the Build Step** を有効のままにする(既定は有効)。
   Phase 1 で `packages/core` を使う時に必須。
3. Install Command は既定(`npm install`。ルートの lock を使う)のままで良い。Build Command も既定。
4. 環境変数・ドメインは変更不要。

よるノートを Vercel に載せる時は、別プロジェクトを作り Root Directory を `apps/yoru` にする。

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

## 注意

- `next dev` はアプリのディレクトリに `AGENTS.md` / `CLAUDE.md` を自動生成する(内容はルートと同じ)。
  生成物なのでコミットして差し支えない。
- コード中の `#62` などの Issue 番号は、取り込み前のリポジトリでは別々の番号体系だった。
  よるノート側(`apps/yoru`)の番号は、アーカイブした旧 `yorunote` リポジトリの Issue を指す。

## 共通コード(`packages/core`)の方針

- **2つのアプリで同一にしたいものだけ**を移す。先回りの抽象化はしない。アプリ固有のもの(記録フロー・同期・選択肢など)は各アプリに残す。
- アプリ名・文言・localStorage のキー接頭辞などの違いは、引数や設定で渡して吸収する(共通コードの中でアプリを判別しない)。
- 端末内データのキー名は変えない(変えるとユーザーの保存済みの状態が消える)。
- テストは共通コードの隣に置く(`packages/core/src/**/*.test.ts`)。移したファイルのテストをアプリ側に残さない。
