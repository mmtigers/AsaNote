# devx — Claude Code 開発自動化

## 構成(共通 / プロジェクト固有)
| 場所 | 種別 | 内容 |
|---|---|---|
| `devx/skills/{repo-survey,issue-fix,verify-handoff}` | **共通**(原本) | どのリポジトリでも使える手順。`devx/install.sh` で `~/.claude/skills/` へ入れる |
| `.claude/verify.steps` | このリポジトリ固有 | 検証の手順と順序(CI と同じ) |
| `CLAUDE.md` の「開発自動化」節 | このリポジトリ固有 | 更新履歴・DB 自動適用などの注意 |
| `.claude/handoff/`(gitignore) | 生成物 | 検証結果 `latest.md`、前回 `prev.md`、ログ `logs/`(新しい50件) |

標準機能で足りるものは作っていない: コードレビュー=`/code-review`・`/security-review`、簡素化=`/simplify`、アプリ起動確認=`/run`、設定の監査=`/doctor`(CLI)・`/fewer-permission-prompts`。

## 使い方
- 初回: `devx/install.sh`(既存の同名スキルは上書きしない。差分があれば表示してスキップ。`--force` で上書き)
- 調査: 「`repo-survey` で apps/oya を調べて」 / Issue: 「`issue-fix` で #123 に対応して」 / 検証: 「`verify-handoff` で検証して」
- 検証コマンド直接実行: `bash ~/.claude/skills/verify-handoff/verify.sh [--keep-going] [--only apps/asa] [--dry-run]`

## 復旧・制約
- スクリプトはソースを書き換えない。消すのは `.claude/handoff/` の古いログだけ。やり直しは再実行すれば足りる。
- 導入を戻す: `rm -r ~/.claude/skills/{repo-survey,issue-fix,verify-handoff}`(原本はこのリポジトリに残る)。
- `node_modules` が無いと失敗する → `npm ci`。クラウドのセッションは `~/.claude` が永続しないので、毎回 `devx/install.sh` が必要。
- スクリプトの手順は `eval` で実行する。`.claude/verify.steps` はコードと同じ扱いで、レビューを通すこと。
