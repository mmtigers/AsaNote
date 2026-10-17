# ADR 0001: おやノートの構成(Supabase・Vercel・Secrets の分け方)

- 状態: 合意済み(2026-10-17)
- 日付: 2026-10-17
- 関連: [おやノート 要件定義書 v0.3](../SPEC.md)(§2・§3・§9)、[MONOREPO.md](../../../../docs/MONOREPO.md)

## 背景

おやノートは、父・母の記録を**互いに見えない**ようにしつつ、家族(管理者・閲覧者)が両方を読める必要がある(要件 §2)。

あさノート・よるノートは同じ Supabase プロジェクトを共有し、「同じグループのメンバーなら全員の記録を読める」RLS
(`supabase/schema.sql` の `records are readable by owner or group members`)で共有している。この方式では:

- 父・母を同じグループに入れると、互いの記録が見える。
- 1人は1グループにしか入れない(`group_members.user_id` が unique)ため、家族が父・母の両方のグループに入れない。
- 招待コードはグループの誰でも発行でき(`group_invites are insertable by group members`)、役割の区別が無い。
- 同期(`sync.ts` の pull)は RLS が許す行をすべて端末へ取り込むため、画面で隠しても端末には残る。

また、あさノート・よるノートの本番DBには、2つのワークフロー(`db-deploy.yml` / `db-deploy-yoru.yml`)が `main` への push で
スキーマを自動適用している。ここへ3つ目のアプリの自動適用を加えると、運用中のあさノートを壊す経路が増える。

## 決定

### 1. リポジトリ: このモノレポに `apps/oya` を追加する

- npm workspaces の1アプリとして追加する(`apps/oya/package.json` の `name` は `oya-note`)。
- `packages/core`(`@note/core`)の UI 部品・`AuthProvider`・Supabase クライアント・CSP をそのまま使う。
- **`packages/core` は原則として変更しない。** core を変えると、あさノート・よるノートの両方で版上げと更新履歴が必要になる
  (MONOREPO.md、#200)。おやノートだけが必要とするもの(JST の「今日」、6桁コードのログイン画面など)は `apps/oya` に置く。
  両アプリにも有益と分かったものは、後から別の PR で core へ移す。

### 2. Supabase: おやノート専用のプロジェクトを新しく作る

| 項目 | 決定 |
|---|---|
| プロジェクト | おやノート専用(あさノート・よるノートのプロジェクトとは別。Auth・DB・Storage のすべてを分ける) |
| リージョン | 東京(ap-northeast-1)。あさノート側と同じにする想定(作成時に確認する) |
| スキーマの正 | `apps/oya/supabase/schema.sql`(1ファイル、**何度流しても同じ結果になる**書き方。あさノート・よるノートと同じ方式) |
| 共通表 | 持たない。あさノートの `groups` / `children` などは**作らない**(おやノート独自の家族・役割の表を持つ) |
| 本番への反映 | 専用のワークフロー `db-deploy-oya.yml`(下の §4) |

#### データアクセスの方式

- 独自の API サーバーは置かず、ブラウザから supabase-js(anon キー + ログイン中のユーザーの JWT)で読み書きする。
  **権限はすべて RLS と、`security definer` の DB 関数で検証する**(要件 §2「サーバー側で検証」)。
- 複数の表をまとめて変える操作(家族の作成・招待コードの使用・記録の完了と写真の選択)は、1つの DB 関数(RPC)にまとめて
  トランザクションで行う(あさノートの `create_group()` / `redeem_group_invite()` と同じ方式)。
- `security definer` の関数は `set search_path = public` を必ず付け、関数の中で `auth.uid()` と役割を確かめる。
- **記録はオンラインで保存する**(要件 §4.2)。あさノート・よるノートの Dexie(端末内DB)+ 後送りの同期は使わない。
  入力途中の内容は localStorage の下書き(`@note/core/localStorageStore`)に保持し、保存に失敗しても失われないようにする。
  これにより「保存成功を確認してから完了」が単純な形で実現でき、他の人の記録が端末に溜まることもない。

#### データモデルの骨子(詳細はタスク3で決める)

| 表 | 役割 | 主な制約 |
|---|---|---|
| `oya_families` | 家族 | — |
| `oya_members` | 家族のメンバーと役割(`parent` / `admin` / `viewer`)、表示名(「父」「母」など) | `user_id` は unique(1人は1家族) |
| `oya_invites` | 招待コード(役割を指定して発行) | 発行は管理者だけ。24時間で失効・1回限り |
| `oya_records` | 日次の記録(要件 §4.1 の項目、`completed_at`) | `unique (user_id, record_date)`。`record_date` は JST の今日以前 |
| `oya_photos` | 孫の写真(Storage のパス、有効/無効) | 追加・無効化・削除は管理者だけ |
| `oya_photo_reveals` | 親ごとの「その日に表示した写真」 | `unique (user_id, record_date)`(1日1回) |

RLS の方針:

- `oya_records`: 親は**自分の行だけ**読み書きできる。管理者・閲覧者は、同じ家族の親の行を**読むだけ**。
  親から、もう一方の親の行は読めない(画面ではなく RLS で拒否する)。
- `oya_photos` と Storage: 管理者・閲覧者は家族の写真を読める。親は `oya_photo_reveals` にある(自分に表示された)写真だけ読める。
- 家族に属さないアカウントは、何も読めない。

#### 日付(JST)

- 対象日は DB 側で `(now() at time zone 'Asia/Tokyo')::date` を基準に検証する(未来日は拒否。過去は制限なし: 要件 B6)。
- 画面側も、端末のタイムゾーンに依存しない JST の「今日」を使う(`Intl.DateTimeFormat` の `timeZone: 'Asia/Tokyo'`。`apps/oya` に置く)。

#### 写真

- Storage の**非公開**バケット `grandchild-photos`。パスは `{family_id}/{photo_id}.jpg`(先頭のフォルダで家族を判定する)。
- 表示は署名付きURL。有効期限は**10分**程度に短くする(URL を知っていれば期限内は誰でも開けるため。よるノートは1時間)。
- アップロード前の縮小は、よるノートの `src/lib/image.ts` の方式を `apps/oya` へ写して使う(core には移さない)。
- 「完了」と「写真の選択」は1つの RPC(例: `complete_record(record_date)`)で行う。写真の選択はその日の初回だけで、直前に表示した
  写真を候補から外す。写真が無いときも完了は成功させる(要件 §5)。

### 3. 認証

- ログインは**メールの6桁コード**(Supabase Auth の Email OTP。`signInWithOtp` で送り、`verifyOtp({ type: 'email' })` で確かめる)。
  Supabase の「Magic Link」メールのテンプレートに `{{ .Token }}` を入れて、コードを送るようにする(ダッシュボードの手動設定。
  テンプレートは `apps/oya/supabase/templates/magic-link.html`。既定のテンプレートはリンクだけで、コードが入らないことをローカルの Supabase で確認した)。
- ログイン状態はブラウザに保存し、毎回のログインを求めない(supabase-js の既定の `persistSession`。リフレッシュトークンで更新)。
  Supabase 側でセッションの有効期限(Time-box)は設定しない。
- アカウントの作成は誰でもできる(Email OTP の既定)。ただし**家族に参加するまでは何も読めない**(RLS)。
  参加は、管理者が発行した招待コードを使う RPC だけ。最初の管理者は、家族に属さないアカウントが `create_family()` で家族を作る。
- **実機で確認すること**(タスク4): iOS・Android のホーム画面アプリで、6桁コードのログインができ、数週間開かなくてもログイン状態が
  続くこと。

### 4. 本番DBへの反映(`db-deploy-oya.yml`)

- `main` への push で、`apps/oya/supabase/schema.sql` が変わったときだけ動く(ワークフロー自身のパスはトリガーに含めない。
  `db-deploy-yoru.yml` と同じ理由)。
- 接続先は新しい Secret **`OYA_SUPABASE_DB_URL`**。既存の `SUPABASE_DB_URL` は**使わない**。
- リポジトリ変数 `OYA_DB_DEPLOY_ENABLED` が `true` になるまでは、警告と job summary を出して何もしない(Supabase プロジェクトを
  作る前にマージしても失敗にしない。`e2e-supabase.yml` と同じ「実行していないことが見える」方式)。有効にした後に Secret が無ければ失敗させる。
- `concurrency` のグループは、あさノート・よるノートとは別にする(DB が別のため、待ち合わせる必要がない)。
- **取り違えの防止**: 適用の前に、接続先にあさノートの表(`public.records` / `public.group_members`)があれば中止する
  (Secret の貼り間違いで、あさノートの本番DBへ流すのを防ぐ)。
- 適用は `psql -v ON_ERROR_STOP=1 -f`(既存と同じ)。

### 5. Vercel

| 項目 | 決定 |
|---|---|
| プロジェクト | 新規(プロジェクト名の候補は `oya-note`) |
| Root Directory | `apps/oya`(「ルート外のファイルを含める」を有効のまま。core を使うため) |
| つなぐリポジトリ | `mmtigers/AsaNote`(このリポジトリ) |
| 環境変数 | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` に、**おやノートのプロジェクトの値**を入れる(Production と Preview)。変数名は core のクライアント(`packages/core/src/supabase/client.ts`)が読む名前のまま。VAPID は使わない(通知は対象外) |
| 本番URL | 作成時に決め、**公開後は変えない**(変えると端末に追加したアプリが別サイト扱いになる。MONOREPO.md) |

- Supabase の Authentication → URL Configuration の Site URL は、おやノートの本番URLにする(専用プロジェクトなので、
  あさノートの設定には触れない)。

### 6. CI

- `ci-oya.yml` を追加し、共通ジョブ `_app-ci.yml`(`app: apps/oya`)を呼ぶ。`paths` は `apps/oya/**` と共通コード・CI 定義など
  (既存の `ci-yoru.yml` にならう)。ドラフトの PR では走らせない(Actions の無料枠のため。既存と同じ)。
- 型ずれの検査は `_db-types-check.yml` を呼ぶ。適用する SQL は `supabase/ci/auth-stub.sql` と `apps/oya/supabase/schema.sql` ×2。
  Storage のポリシーのため、`storage` スキーマの最小スタブも `apps/oya/supabase/ci/` に置く。
- **RLS の検証**は、型生成用のスタブ(`auth.uid()` が常に null)では行えない。`auth.uid()` が
  `current_setting('request.jwt.claim.sub')` を返す検証用のスタブを `apps/oya/supabase/ci/` に置き、素の Postgres 上で
  「父・母・管理者・閲覧者・家族外・未ログイン」ごとに読める行・書ける行を確かめるテストを CI で実行する(タスク3)。
- 更新履歴の検査(`scripts/check-release-notes.mjs`)は、他のアプリと同じく `apps/oya` 単位で動く。

## 検討した他の案

| 案 | 採らなかった理由 |
|---|---|
| ① 既存のグループの仕組みを拡張する | 共通表の定義の正はあさノート側で、変えると運用中のあさノート・よるノートに影響する。役割の追加も共通表への変更になる |
| ② 同じ Supabase プロジェクトに `oya_` の表を足す | 本番DB・`auth.users` をあさノートと共有する(親のアカウントがあさノートにもログインできる、Site URL の制約、自動適用が3系統になる) |
| ④ 別リポジトリにする | `packages/core` を流用しにくく、CI の共通ジョブも複製になる |

## 結果

### 良い点

- あさノート・よるノートの本番DB・ログイン・設定に、一切触れずに作れる。
- 父・母の分離と役割を、既存の RLS と混ぜずに新しく設計できる。
- core を変えなければ、既存の2アプリの版上げは不要。

### 引き受けるもの

- Supabase と Vercel のプロジェクトが1つずつ増える(設定・Secret・バックアップを別に管理する)。
- グループ・招待の仕組みは、方式だけを参考にして新しく書く(コードの重複は許容する)。
- オフラインでは記録を完了できない(要件 B4 で合意済み)。

### 確認が必要なこと(オーナーの作業・決定)

| # | 内容 | いつまでに |
|---|---|---|
| 1 | Supabase の契約プラン。無料プランの場合、1つの組織で同時に動かせる無料プロジェクトの数に上限があり、しばらく使われないプロジェクトは一時停止されることがある(現在の上限・条件は Supabase の料金ページで確認する)。おやノートの本番と、RLS の E2E 用テストプロジェクトを置けるか | タスク3の前 |
| 2 | バックアップ。プランによって自動バックアップの有無・保持期間が違う。要件 §8 は「記録・写真を削除しない」ため、バックアップの方法(プランの機能 or 定期的な書き出し)を決める | タスク10の前 |
| 3 | Vercel のプロジェクト名と本番URL | タスク2の後(Preview の確認時) |

## 実施の手順(この ADR の合意後)

1. タスク2: `apps/oya` の土台と `ci-oya.yml`(DB には接続しない)。
2. オーナーの作業: Supabase の新しいプロジェクトの作成、Vercel のプロジェクトの作成と環境変数、GitHub Secret `OYA_SUPABASE_DB_URL` の登録。
3. タスク3: `apps/oya/supabase/schema.sql` と RLS のテスト、`db-deploy-oya.yml`(実施済み)。
4. オーナーの作業(本番へ反映する前): Supabase プロジェクトの作成 → Secret `OYA_SUPABASE_DB_URL` の登録 → リポジトリ変数
   `OYA_DB_DEPLOY_ENABLED=true` → `db-deploy-oya.yml` を手動実行(初回の適用)。
