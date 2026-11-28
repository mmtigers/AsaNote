# さくひんノート 〜おうちの美術館〜

子どもが幼稚園・保育園・小学校で作って持ち帰った絵や工作を、写真に撮って「収蔵」し、
額縁に入れて見返せる、家族向けのスマホアプリ(PWA)。

> 状態: 土台のみ(要件 §13 のタスク3)。ログイン・作品の収蔵・DB はまだ無い。

- 要件: [docs/SPEC.md](docs/SPEC.md)
- 見た目のモック: [docs/mock.html](docs/mock.html)(ブラウザで開くと操作できる)
- DB・ログインは、あさノート・よるノートと同じ Supabase プロジェクトを使う予定(要件 §9・§11 D7)

## コマンド(このディレクトリで)

```bash
npm run dev            # 開発サーバー
npm run build          # 本番ビルド
npm run lint
npm run test           # 単体テスト(Vitest)
npm run test:e2e       # E2E(Playwright。先に npm run build が要る)
node scripts/generate-icons.mjs   # design/icon.svg からアイコンの PNG を書き出す
```

依存の導入はリポジトリのルートで `npm ci`(package-lock.json はルートに1つ)。

## 更新履歴

`src/data/releases.ts` に新しい順で書く。ユーザーに見える変更を入れるときは追加して、`package.json` /
`package-lock.json` の version も同じ値に上げる(CI の Release notes check が検査する。ほかのアプリと同じ)。
