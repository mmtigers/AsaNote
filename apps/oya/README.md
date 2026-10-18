# おやノート

離れて暮らす両親(父・母)が毎日のようすを記録し、家族がその記録を確認できるスマホ向けアプリ(PWA)。
記録を完了すると、孫の写真が1枚表示される。

> 状態: タスク6まで(ログイン・家族の管理・親の記録の入力と孫の写真の表示)。写真の管理画面はタスク8、家族向けの閲覧はタスク9。

- 要件: [docs/SPEC.md](docs/SPEC.md)
- 構成の決定: [docs/adr/0001-architecture.md](docs/adr/0001-architecture.md)(専用の Supabase プロジェクト、Vercel の別プロジェクト)

## 画面

| ルート | 内容 |
|---|---|
| `/` | 未ログイン: ログインへの案内 / 家族に未参加: 招待コードで参加(最初の1人は家族を作る) / 親: 今日の記録への入口と直近7日の状況(完了・途中まで・未記録) |
| `/record?date=YYYY-MM-DD` | 親の1日の記録(`RecordForm`)。1画面で入力し「途中で保存する」「記録を完了する」。完了すると孫の写真(`CompletionPanel`)。完了済みの日も修正でき、「この日の写真を見る」で同じ写真をもう一度見られる。日付が無い・未来なら日本時間の今日 |
| `/login` | メールに届いた数字(コード)でログイン(`OtpLoginView`) |
| `/family` | メンバーの一覧と「家族から抜ける」。家族管理者は、招待コードの発行・取り消し、役割の変更、メンバーを外す操作 |
| `/photos` | 孫の写真の管理(家族管理者だけ。`PhotoManager`)。追加(端末で長い辺1600pxの JPEG にしてから送る)・表示に使う/使わない・削除 |
| `/updates` | 更新履歴 |

ログイン中の人の所属(家族・役割)は `src/lib/membership.tsx` が読み、画面の出し分けに使う。**出し分けは表示のためだけ**で、
権限はサーバー(RLS と DB の関数)が検証する。DB のエラー(`invite_invalid` など)は `src/lib/errors.ts` で日本語の案内にする。

## 記録の保存(タスク5)

- `src/lib/saveRecord.ts`(`saveDailyRecord`): 下書きを端末に残す → サーバーへ保存(`(user_id, record_date)` の upsert で1日1件)
  → 成功したら下書きを消す → 「完了」なら、保存の成功を確かめた後にだけ `complete_oya_record()` を呼ぶ。
  保存に失敗したら例外を投げ、下書きは残る(再試行できる)。完了だけ失敗したら `saved-not-completed`(記録は保存済み)。
- `src/lib/recordDraft.ts`: 下書き(利用者・日付ごと。ログアウトで消す)。`src/lib/jst.ts`: 日本時間の今日・日付の検証。
- `src/constants/choices.ts`: 選択肢(値は DB の check 制約と同じ。文言・並びはここで調整する)。

## Supabase の設定(オーナーが、おやノート専用のプロジェクトで1回だけ行う)

1. **Authentication → Email Templates → Magic Link** を、[supabase/templates/magic-link.html](supabase/templates/magic-link.html) の内容に
   置き換える(件名の例: 「おやノートのログイン用の数字」)。**既定のテンプレートはリンクだけで数字が入らないため、そのままではログインできない**
   (ローカルの Supabase で確認済み)。
2. **Authentication → URL Configuration** の Site URL を、おやノートの本番 URL にする。
3. Email OTP の桁数は既定(6桁)のままでよい(画面は6〜10桁を受け付ける)。

## DB(`supabase/`)

- `schema.sql` がスキーマの正(何度流しても同じ結果になる書き方)。表は `oya_` で始める。
  権限は RLS と `security definer` の関数で検証する(父・母は互いの記録を読めない、など。SPEC §2)。
- `tests/rls.test.sql`: 父・母・家族管理者・閲覧者・部外者・未ログインごとに、読める行・書ける行を確かめるテスト。
  `ci/supabase-stub.sql`(auth・storage・ロールのスタブ。`auth.uid()` がリクエストの JWT を返す)の上で、素の Postgres で動く。
- `src/lib/db/database.types.ts` は `npm run db:types` で生成する(手で直さない。CI が型ずれを検査する)。
- 本番への反映は `.github/workflows/db-deploy-oya.yml`(`main` へのマージで、`schema.sql` が変わったとき)。
  リポジトリ変数 `OYA_DB_DEPLOY_ENABLED=true` と Secret `OYA_SUPABASE_DB_URL` を登録するまでは、警告を出して何もしない。

## コマンド(このディレクトリで)

```bash
npm run dev            # 開発サーバー
npm run build          # 本番ビルド
npm run lint
npm run test           # 単体テスト(Vitest)
npm run test:e2e       # E2E(Playwright。先に npm run build が要る)
npm run test:db        # DB の権限のテスト(要 Docker。DB_URL を渡すとその空の DB で実行)
npm run db:types       # schema.sql から型(src/lib/db/database.types.ts)を再生成(要 Docker)
node scripts/generate-icons.mjs   # design/icon.svg からアイコンの PNG を書き出す
```

依存の導入はリポジトリのルートで `npm ci`(package-lock.json はルートに1つ)。

## 更新履歴

`src/data/releases.ts` に新しい順で書く。ユーザーに見える変更を入れるときは追加して、`package.json` /
`package-lock.json` の version も同じ値に上げる(CI の Release notes check が検査する。あさノート・よるノートと同じ)。
