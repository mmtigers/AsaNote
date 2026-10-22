#!/usr/bin/env bash
# 検証(lint / 型 / テスト / ビルド)を順に実行し、結果を引き継ぎメモに書く。
# 使い方: verify.sh [--keep-going] [--only <app-dir>] [--dry-run]
#   手順の定義: <repo>/.claude/verify.steps(あれば)。無ければカレントの package.json から自動検出。
#   形式(1行1手順、# はコメント):  名前 | 作業ディレクトリ(repo相対) | コマンド(名前・ディレクトリに | は不可。--only は steps と同じ表記で完全一致)
# 出力: <repo>/.claude/handoff/latest.md と、ステップごとのログ(.claude/handoff/logs/)
# 終了コード: 0=全成功 / 1=失敗あり / 2=使い方の誤り。何も書き換えない(ソースは読むだけ)。
set -u -o pipefail

keep_going=0; only=""; dry=0
while [ $# -gt 0 ]; do
  case "$1" in
    --keep-going) keep_going=1 ;;
    --dry-run) dry=1 ;;
    --only) shift; only="${1:-}"; [ -n "$only" ] || { echo "--only にはディレクトリが要ります" >&2; exit 2; } ;;
    -h|--help) sed -n 2,10p "$0"; exit 0 ;;
    *) echo "不明な引数: $1" >&2; exit 2 ;;
  esac
  shift
done

trim() { local v="$1"; v="${v#"${v%%[![:space:]]*}"}"; printf %s "${v%"${v##*[![:space:]]}"}"; }
repo=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "Git リポジトリの中で実行してください" >&2; exit 2; }
cd "$repo" || exit 2
steps=()
if [ -f .claude/verify.steps ]; then
  while IFS= read -r line; do
    case "$line" in ''|\#*) continue ;; esac
    steps+=("$line")
  done < .claude/verify.steps
else
  # 自動検出: カレント(リポジトリ直下)の package.json にあるスクリプトを、この順で
  for s in lint typecheck test build; do
    if node -e "process.exit(require('./package.json').scripts?.['$s']?0:1)" 2>/dev/null; then
      steps+=("$s | . | npm run $s")
    fi
  done
fi
[ ${#steps[@]} -gt 0 ] || { echo "実行できる検証手順が見つかりません(package.json のスクリプトか .claude/verify.steps)" >&2; exit 2; }

out=.claude/handoff; logs=$out/logs
[ "$dry" -eq 1 ] && out=$(mktemp -d)   # dry-run は実結果を上書きしない
mkdir -p "$logs"
ts=$(date +%Y%m%d-%H%M%S)
branch=$(git rev-parse --abbrev-ref HEAD); head=$(git rev-parse --short HEAD)
changed=$(git status --porcelain | wc -l | tr -d ' ')
rows=""; fails=0; ran=0; skipped_after=0; failed_names=""

for entry in "${steps[@]}"; do
  IFS='|' read -r name dir cmd <<<"$entry"
  name=$(trim "$name"); dir=$(trim "$dir"); cmd=$(trim "$cmd")
  if [ -n "$only" ] && [ "$dir" != "$only" ]; then continue; fi
  if [ "$fails" -gt 0 ] && [ "$keep_going" -eq 0 ]; then
    rows+="| $name | $dir | SKIP | 前の失敗で中断(--keep-going で続行) |"$'\n'; skipped_after=1; continue
  fi
  if [ "$dry" -eq 1 ]; then rows+="| $name | $dir | DRY | \`${cmd//|/\\|}\` |"$'\n'; continue; fi
  log="$logs/$ts-$(echo "$dir-$name" | tr '/ .' '___').log"
  start=$(date +%s)
  ( cd "$dir" && eval "$cmd" ) >"$log" 2>&1; rc=$?
  secs=$(( $(date +%s) - start )); ran=$((ran+1))
  if [ $rc -eq 0 ]; then rows+="| $name | $dir | PASS | ${secs}s |"$'\n'
  else
    fails=$((fails+1)); failed_names+="$dir:$name "
    rows+="| $name | $dir | **FAIL($rc)** | ${secs}s, ログ: \`$log\` |"$'\n'
  fi
done

[ -z "$rows" ] && { echo "--only '$only' に一致する手順がありません" >&2; exit 2; }
# 手で追記した引き継ぎを消さないよう、直前の結果は prev.md に退避し、ログは新しい50件だけ残す
[ "$dry" -eq 0 ] && [ -f "$out/latest.md" ] && mv "$out/latest.md" "$out/prev.md"
ls -t "$logs"/*.log 2>/dev/null | tail -n +51 | xargs -r rm -f
{
  echo "# 検証結果 ($(date '+%Y-%m-%d %H:%M'))"
  echo
  echo "- ブランチ: \`$branch\` @ \`$head\` / 未コミットの変更: ${changed} ファイル"
  echo "- 実行: $ran 手順 / 失敗: $fails"
  echo
  echo "| 手順 | 場所 | 結果 | 備考 |"
  echo "|---|---|---|---|"
  printf '%s' "$rows"
} >"$out/latest.md"

# 失敗ログの末尾を追記(失敗したステップのみ)
if [ $fails -gt 0 ]; then
  printf "\n## 失敗ログ(末尾20行)\n" >>"$out/latest.md"
  for entry in "${steps[@]}"; do
    IFS='|' read -r name dir cmd <<<"$entry"; name=$(trim "$name"); dir=$(trim "$dir")
    case " $failed_names " in *" $dir:$name "*)
      log="$logs/$ts-$(echo "$dir-$name" | tr '/ .' '___').log"
      { echo; echo "### $dir / $name"; echo '```'; tail -20 "$log"; echo '```'; } >>"$out/latest.md" ;;
    esac
  done
fi
cat >>"$out/latest.md" <<'EOT'

## 次の作業 / 未解決(手で追記)
- 
EOT
cat "$out/latest.md"
[ $fails -eq 0 ]
