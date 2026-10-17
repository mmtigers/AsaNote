// @vitest-environment node
//
// import.meta.url を使ってファイルを読むため、jsdom ではなく node 環境で動かす。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Tailwind は、アプリのディレクトリの外にある共通コード(packages/core)を自動では走査しない。
// この指定が外れると、core へ移した部品のスタイルが本番だけ静かに欠ける(ビルドも型検査も通る)ため、固定する。
const GLOBALS_CSS = fileURLToPath(new URL("./globals.css", import.meta.url));

describe("globals.css", () => {
  it("@note/core の部品のクラスを Tailwind が拾うよう、packages/core/src を @source に指定している", () => {
    const css = readFileSync(GLOBALS_CSS, "utf8");
    expect(css).toContain('@source "../../../../packages/core/src";');
  });

  it("core のテストファイルは走査しない(テスト内の文字から、余計なクラスが作られないように)", () => {
    const css = readFileSync(GLOBALS_CSS, "utf8");
    expect(css).toContain('@source not "../../../../packages/core/src/**/*.test.{ts,tsx}";');
  });
});
