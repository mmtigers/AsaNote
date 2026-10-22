#!/usr/bin/env bash
# devx/skills/* を ~/.claude/skills/ へコピーする(個人用・全プロジェクト共通)。
# 既存と同名のスキルは上書きしない(内容が同じなら何もせず、違えば差分を表示してスキップ)。
# 使い方: devx/install.sh [--force]   ※ --force は同名で内容が違うものを上書きする(利用者が確認してから)
set -u
force=0; [ "${1:-}" = "--force" ] && force=1
src="$(cd "$(dirname "$0")/skills" && pwd)"; dst="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
mkdir -p "$dst"
for d in "$src"/*/; do
  n=$(basename "$d")
  if [ ! -e "$dst/$n" ]; then cp -r "$d" "$dst/$n" && echo "installed: $n"
  elif diff -r -q "$d" "$dst/$n" >/dev/null; then echo "unchanged: $n"
  elif [ $force -eq 1 ]; then rm -rf "$dst/$n" && cp -r "$d" "$dst/$n" && echo "overwritten: $n"
  else echo "SKIPPED (差分あり。--force で上書き): $n"; diff -r "$d" "$dst/$n" | head -10; fi
done
