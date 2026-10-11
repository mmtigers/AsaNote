// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatCoverageSummary } from "../../../../scripts/coverage-summary.mjs";

const metric = (covered: number, total: number) => ({
  total,
  covered,
  skipped: 0,
  pct: total === 0 ? 100 : Math.round((covered / total) * 10000) / 100,
});
const file = (covered: number, total: number) => ({
  lines: metric(covered, total),
  statements: metric(covered, total),
  functions: metric(0, 0),
  branches: metric(0, 0),
});

const summary = {
  total: {
    lines: metric(60, 100),
    statements: metric(55, 100),
    functions: metric(5, 10),
    branches: metric(2, 4),
  },
  "/work/repo/apps/asa/src/lib/a.ts": file(10, 10),
  "/work/repo/apps/asa/src/app/page.tsx": file(0, 80),
  "/work/repo/apps/asa/src/lib/b.ts": file(5, 10),
  "/work/repo/apps/asa/src/lib/empty.ts": file(0, 0),
};

describe("formatCoverageSummary(#207)", () => {
  const md = formatCoverageSummary(summary, "apps/asa");

  it("4つの指標を、カバー率と件数つきの表にする", () => {
    expect(md).toContain("### カバレッジ(apps/asa)");
    expect(md).toContain("| 文(Statements) | 55.00% | 55 / 100 |");
    expect(md).toContain("| 分岐(Branches) | 50.00% | 2 / 4 |");
    expect(md).toContain("| 関数(Functions) | 50.00% | 5 / 10 |");
    expect(md).toContain("| 行(Lines) | 60.00% | 60 / 100 |");
  });

  it("行カバー率の低いファイルを低い順に出し、文が無いファイルは除く。パスはリポジトリ内の相対にする", () => {
    const table = md.slice(md.indexOf("| ファイル |"));
    expect(table.indexOf("apps/asa/src/app/page.tsx")).toBeLessThan(table.indexOf("apps/asa/src/lib/b.ts"));
    expect(table.indexOf("apps/asa/src/lib/b.ts")).toBeLessThan(table.indexOf("apps/asa/src/lib/a.ts"));
    expect(table).not.toContain("empty.ts");
    expect(table).not.toContain("/work/repo/");
  });

  it("閾値でブロックしないことを明記する", () => {
    expect(md).toContain("閾値でのブロックはしない");
  });

  it("指標が欠けていても落ちない(- を出す)", () => {
    const partial = formatCoverageSummary({ total: { lines: metric(1, 2) } }, "x");
    expect(partial).toContain("| 文(Statements) | - | - |");
    expect(partial).toContain("| 行(Lines) | 50.00% | 1 / 2 |");
  });
});
