# あさノート

子どもが登校を渋る朝のようすを、選ぶだけでサッと記録する家族向けメモアプリ。

- 登校結果(スムーズ/行き渋り/お休み)・起床時刻・出発時刻・理由を、1画面でタップするだけで入力(メモは任意)
- 入力内容から日記に近い文章を自動生成してプレビュー
- 傾向(曜日別・起床時刻別のスムーズ率、理由の集計)の確認と、期間指定のエクスポート(印刷/PDF・CSV)
- 未入力日のリマインド(アプリ内・Push通知)とパートナーの記録追加通知
- 夫婦・家族単位でグループを作ると、どちらが記録しても両方のスマホから見える
- オフラインでも記録でき、通信が回復すると自動で同期する

詳細な仕様は [docs/SPEC.md](./docs/SPEC.md) を参照。

## 技術スタック

- Next.js (App Router, TypeScript, Tailwind CSS)
- Supabase (Postgres / Auth)
- Dexie.js (IndexedDB) — オフライン優先のローカルキャッシュ
- 手書きService Worker (`public/sw.js`) — PWAオフラインシェル・Push通知の受信
- Supabase Edge Functions (Deno) + pg_cron — Push通知の送信

## セットアップ

モノレポのため、依存の導入はリポジトリのルートで行う(`package-lock.json` はルートに1つ)。

```bash
npm ci                  # リポジトリのルートで(全ワークスペースの依存を入れる)
cd apps/asa
cp .env.local.example .env.local
# .env.local に Supabase の URL / anon key を設定
# (Push通知を試す場合は NEXT_PUBLIC_VAPID_PUBLIC_KEY も。docs/push-notifications-setup.md 参照)
npm run dev
```

Supabase側のテーブル作成は、初回のみ [supabase/schema.sql](../../supabase/schema.sql)(リポジトリのルート直下。あさノートの正) をSQL Editorで実行する。
以降は `main` にマージされた `schema.sql` の変更を
[.github/workflows/db-deploy.yml](../../.github/workflows/db-deploy.yml) が本番へ自動適用する（#53）。
この自動適用には、リポジトリのシークレット `SUPABASE_DB_URL`（SupabaseのSession poolerの接続文字列）が必要。

### 認証（メールのマジックリンク）

パスワード不要のマジックリンク認証を採用している(コードの手入力は無い)。Supabaseダッシュボードで以下を設定すること。

1. 「Authentication」→「URL Configuration」で **Site URL** と **Redirect URLs** に
   アプリのURL（開発時は `http://localhost:3000`、本番は実際のドメイン）を追加する。
   未設定だとログインリンクのリダイレクトが失敗する。
2. ログインしなくてもこの端末内での記録・閲覧は可能（オフラインファースト）。
   ログインするとSupabaseへの同期が有効になり、家族とデータを共有できる。

### 家族との共有（グループ機能）

「共有」タブからグループを作成し、招待コードをパートナーに共有すると、以後どちらが
記録してもお互いのスマホから見えるようになる。編集・削除は記録した本人のみ可能。
招待コードは8文字で、発行から24時間・1回限り有効。

## ディレクトリ構成

モノレポ構成。あさノートは `apps/asa/`、よるノートは `apps/yoru/`、共通コードは `packages/core/`
(構成と方針は [docs/MONOREPO.md](../../docs/MONOREPO.md))。以下は `apps/asa/` の中身と、あさノートが使うルート直下のもの。

```
src/
  app/            App Routerのページ・レイアウト
  components/     共有UIコンポーネント
  data/           更新履歴(releases.ts)
  lib/
    supabase/     Supabaseクライアント
    db/           Dexieローカルキャッシュ・オフライン同期ロジック
  constants/      記録フォームの選択肢(タグ)の唯一の情報源
  types/          SchoolRecord / Group などの型定義
../../supabase/    (リポジトリのルート直下。共有DBの共通表の正)
  schema.sql      テーブル定義・RLSポリシー・SQL関数・計測ビュー(records / groups / group_members / group_invites /
                  children / push_subscriptions / notification_settings / analytics_events)
  functions/      Push通知を送るEdge Function(send-reminders / notify-partner)
  cron-reminders.sql, partner-notify-trigger.sql  Push通知のpg_cron・トリガー設定(手動適用)
  cron-cleanup-groups.sql  空グループ・期限切れ招待コードの掃除のpg_cron設定(手動適用。docs/group-cleanup.md)
  ci/             CI(型ドリフト検査)で使うSQLスタブ
scripts/
  gen-db-types.sh     database.types.ts の再生成スクリプト
  import-records.mjs  過去の記録をまとめてSupabaseへ登録する一括インポートスクリプト
                       (service role key使用。使い方はファイル冒頭のコメント参照)
e2e/              Playwright のE2Eテスト
e2e-supabase/     実Supabaseテストプロジェクト向けE2E(Secrets未設定なら skip。docs/e2e-supabase.md)
docs/             仕様書(SPEC.md)・Push通知のデプロイ手順(push-notifications-setup.md)・実Supabase E2E の準備(e2e-supabase.md)
```

## オフライン同期の仕組み

1. 「記録する」操作は `src/lib/db/records.ts` を通じて即座にDexie(IndexedDB)へ書き込まれる（`syncStatus: "pending"`）。
2. `src/lib/db/sync.ts` の `syncPendingChanges` が起動時・オンライン復帰時・保存/削除の直後に `syncStatus: "pending"` のレコードをSupabaseへバッチupsertし、成功したものを `"synced"` に更新する。
3. `src/lib/db/sync.ts` の `pullFromCloud` がログイン直後・起動時、およびグループへの参加後・脱退後(`src/app/group/useGroupAdmin.ts`)にSupabase側の記録をDexieへ取り込む。他端末(パートナーの端末)での記録や、この端末のIndexedDBが空(再インストール等)の場合の復元に使う。ローカルに未送信の変更(`"pending"`)がある行は上書きしない。
4. IDはクライアント側でUUID生成し、ローカルとクラウドで同一IDを使うため、同期はべき等（idempotent）に行える。

## テスト

```bash
npm run lint            # ESLint
npm run test            # Vitest（ユニットテスト）
npm run test:coverage   # カバレッジ付き（CIと同じ。閾値は設けていない）
npm run build           # 型チェック込みの本番ビルド
```

push・PR毎に `.github/workflows/ci.yml` が上記を自動実行する（`lint-build-test` / E2E の
Playwright / Supabase型ドリフト検査 / 更新履歴チェックの4ジョブ）。ワークフローは最小権限（`permissions: contents: read`）で
動き、各ジョブに `timeout-minutes` を設定している。カバレッジは閾値でブロックせず、
`coverage-report` 成果物として14日間保存し推移を見る（Issue #60）。

依存更新は `.github/dependabot.yml` が週次で minor/patch をまとめた1本のPRとして起票する。
メジャー更新は個別PRで、`eslint` と `typescript` のメジャーは周辺ツールが未対応のため無視している。

## 更新ルール

ユーザー向けの変更(`src/app` `src/components` `src/lib` `src/constants` `public`)は、同じPRで
`src/data/releases.ts` に更新履歴を追加し、version(`package.json` / `package-lock.json` も)を上げる。
CIの `release-notes-check` が検出する。載せない変更は PR に `no-release-note` ラベル、または
本文・コミットに `[skip release-note]` を付ける。仕様書(docs/SPEC.md)の更新はCIでは強制されないため、
挙動を変えるPRでは同じPRで更新する。
