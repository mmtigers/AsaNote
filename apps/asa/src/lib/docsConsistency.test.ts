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
