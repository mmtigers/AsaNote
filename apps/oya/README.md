# おやノート

離れて暮らす両親(父・母)が毎日のようすを記録し、家族がその記録を確認できるスマホ向けアプリ(PWA)。
記録を完了すると、孫の写真が1枚表示される。

> 状態: 土台のみ(タスク2)。記録・ログイン・DB はまだ無い。

- 要件: [docs/SPEC.md](docs/SPEC.md)
- 構成の決定: [docs/adr/0001-architecture.md](docs/adr/0001-architecture.md)(専用の Supabase プロジェクト、Vercel の別プロジェクト)

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
`package-lock.json` の version も同じ値に上げる(CI の Release notes check が検査する。あさノート・よるノートと同じ)。
