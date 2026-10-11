// カバレッジの数値を、GitHub Actions の job summary に出す(#207)。
// coverage-report 成果物を開かなくても、PR の画面から数値の推移が分かるようにするため。
// 閾値によるブロックはしない(#60。vitest.config.mts のコメント)。数値を見せるだけ。
//
// 使い方: node scripts/coverage-summary.mjs <coverage-summary.json のパス> <見出し(例 apps/asa)>
// 入力は vitest の coverage reporter「json-summary」の出力。GITHUB_STEP_SUMMARY があればそこへ追記し、
// 無ければ標準出力へ出す(ローカルでの確認用)。入力が無くても失敗にはしない(数値が出ないだけ)。
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const METRICS = [
  ["statements", "文(Statements)"],
  ["branches", "分岐(Branches)"],
  ["functions", "関数(Functions)"],
  ["lines", "行(Lines)"],
];
const LOWEST_FILES = 5;

const pct = (metric) => (typeof metric?.pct === "number" ? `${metric.pct.toFixed(2)}%` : "-");

/**
 * @param {{ total: Record<string, { total: number, covered: number, pct: number }> } & Record<string, unknown>} summary
 * @param {string} label 見出し(対象のディレクトリ)
 * @returns {string} Markdown
 */
export function formatCoverageSummary(summary, label) {
  const lines = [`### カバレッジ(${label})`, "", "| 指標 | カバー率 | カバー済み / 全体 |", "| --- | ---: | ---: |"];
  for (const [key, name] of METRICS) {
    const m = summary.total?.[key];
    lines.push(`| ${name} | ${pct(m)} | ${m ? `${m.covered} / ${m.total}` : "-"} |`);
  }

  // 行カバー率の低いファイル(文が1つも無いファイルは除く)。どこを足すと効くかの目安。
  const files = Object.entries(summary)
    .filter(([path, value]) => path !== "total" && value?.lines?.total > 0)
    .map(([path, value]) => ({ path, pct: value.lines.pct, total: value.lines.total }))
    .sort((a, b) => a.pct - b.pct || b.total - a.total)
    .slice(0, LOWEST_FILES);
  if (files.length > 0) {
    lines.push("", `<details><summary>行カバー率の低いファイル(下位${files.length}件)</summary>`, "", "| ファイル | 行カバー率 | 行数 |", "| --- | ---: | ---: |");
    for (const f of files) {
      // 絶対パスのままだと長いので、リポジトリ内の相対パスに縮める。
      const short = f.path.replace(/^.*?\/(?=(apps|packages)\/)/, "");
      lines.push(`| \`${short}\` | ${f.pct.toFixed(2)}% | ${f.total} |`);
    }
    lines.push("", "</details>");
  }
  lines.push("", "_閾値でのブロックはしない(数値の推移を見るだけ)。_", "");
  return lines.join("\n");
}

function main() {
  const [, , file, label = ""] = process.argv;
  if (!file) {
    console.error("使い方: node scripts/coverage-summary.mjs <coverage-summary.json> <見出し>");
    return 1;
  }
  let markdown;
  if (!existsSync(file)) {
    markdown = `### カバレッジ(${label})\n\n数値を出せませんでした(${file} がありません)。\n`;
  } else {
    markdown = formatCoverageSummary(JSON.parse(readFileSync(file, "utf8")), label);
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  else console.log(markdown);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
