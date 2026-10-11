// @vitest-environment node
//
// このリポジトリの vitest 既定環境は jsdom だが、jsdom では import.meta.url が
// file: URL にならず fileURLToPath が落ちる。ファイルを読むだけの検査なので node 環境に切り替える。
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * 仕様書・README の静的検査(#201)。実装との乖離そのものは機械では検出できないが、
 * リンク切れと見出し番号の重複は、モノレポ化(ディレクトリ移動)や章の追加のたびに起きやすい。
 */

const APP_ROOT = fileURLToPath(new URL("../../", import.meta.url));

describe("apps/asa/README.md のリンク", () => {
  const readme = readFileSync(`${APP_ROOT}README.md`, "utf8");

  it("相対パスのリンク先が実在する(モノレポ化でルートへ移ったファイルのリンク切れを防ぐ)", () => {
    const links = [...readme.matchAll(/\]\((\.{1,2}\/[^)#\s]+)/g)].map((m) => m[1] ?? "");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(existsSync(resolve(dirname(`${APP_ROOT}README.md`), link)), link).toBe(true);
    }
  });

  it("セットアップは npm ci(運用・ルート README と同じ)", () => {
    expect(readme).toContain("npm ci");
    expect(readme).not.toMatch(/^npm install\b/m);
  });
});

describe("apps/asa/docs/SPEC.md の見出し", () => {
  const spec = readFileSync(`${APP_ROOT}docs/SPEC.md`, "utf8");

  it("「### N.M」形式の節番号が重複していない(付録の後ろに同じ番号の節を足さない)", () => {
    const numbers = [...spec.matchAll(/^### (\d+\.\d+) /gm)].map((m) => m[1] ?? "");
    expect(numbers.length).toBeGreaterThan(10);
    const duplicated = numbers.filter((n, i) => numbers.indexOf(n) !== i);
    expect(duplicated).toEqual([]);
  });
});

describe("ログの保管期間・上限(#199・#216)", () => {
  // 保管期間や上限を schema.sql だけ変えて、運用手順書(docs/log-retention.md)が古いまま残るのを防ぐ。
  const ROOT = resolve(APP_ROOT, "../../");
  const schema = readFileSync(`${ROOT}/supabase/schema.sql`, "utf8");
  const doc = readFileSync(`${ROOT}/docs/log-retention.md`, "utf8");

  it("schema.sql の保管期間・上限が、運用手順書の数値と一致する", () => {
    expect(schema).toContain("created_at < now() - interval '90 days'");
    expect(schema).toContain("sent_on < (now() at time zone 'Asia/Tokyo')::date - 7");
    expect(schema).toContain("count(*) from client_errors) >= 20000");
    expect(doc).toContain("**90日**");
    expect(doc).toContain("**7日**");
    expect(doc).toContain("20,000");
  });

  it("掃除の関数・確認用ビューは anon / authenticated から使えない(revoke)", () => {
    expect(schema).toContain("revoke all on function cleanup_old_logs() from public");
    expect(schema).toContain("revoke all on function cleanup_old_logs() from %I");
    expect(schema).toContain("revoke all on table client_errors_summary_7d from %I");
  });

  it("cron の登録SQLが、手順書が案内するファイル名・ジョブ名で存在する", () => {
    const cron = readFileSync(`${ROOT}/supabase/cron-cleanup-logs.sql`, "utf8");
    expect(cron).toContain("'cleanup-old-logs'");
    expect(cron).toContain("cleanup_old_logs()");
    expect(doc).toContain("supabase/cron-cleanup-logs.sql");
  });
});
