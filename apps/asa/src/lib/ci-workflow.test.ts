// @vitest-environment node
//
// このリポジトリの vitest 既定環境は jsdom だが、jsdom では import.meta.url が
// file: URL にならず fileURLToPath が落ちる。ファイルを読むだけの検査なので
// このファイルだけ node 環境に切り替える。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `.github/workflows/ci.yml` の静的検査(#60)。
 *
 * サードパーティのアクションをメジャータグ(`@v4`)で参照すると、タグは可変なので
 * 同じ `@v4` が後から別のコードを指しうる。`supabase/setup-cli@v1` に至っては
 * `v1` が**タグですらなくブランチ**で、push のたびに中身が変わる。
 *
 * SHA 固定は書いた直後は正しくても、次に誰かがステップを足すときタグ参照に
 * 戻りやすいため、テストで固定する。更新は Dependabot の `github-actions`
 * エコシステムが SHA ごと追随する(`with.version` は対象外なので手動)。
 */

const WORKFLOW = fileURLToPath(new URL("../../../../.github/workflows/ci.yml", import.meta.url));

/** `uses:` の参照をすべて拾う(`actions/checkout@<ref>` の `<ref>` 部分)。 */
function usesRefs(): { action: string; ref: string }[] {
  const yaml = readFileSync(WORKFLOW, "utf8");
  // このリポジトリの tsconfig は noUncheckedIndexedAccess が有効なので、
  // キャプチャグループの参照は undefined を潰してから返す。
  return [...yaml.matchAll(/uses:\s*([^@\s]+)@(\S+)/g)].map((m) => ({
    action: m[1] ?? "",
    ref: m[2] ?? "",
  }));
}

describe(".github/workflows/ci.yml のアクション参照", () => {
  const refs = usesRefs();

  it("uses: を1つ以上検出できている(正規表現が壊れていないことの確認)", () => {
    expect(refs.length).toBeGreaterThan(0);
  });

  it.each(refs)("$action が 40 桁のコミットSHAで固定されている", ({ ref }) => {
    expect(ref).toMatch(/^[0-9a-f]{40}$/);
  });

  it("固定した SHA の横に、どのバージョンかを示すコメントが付いている", () => {
    // SHA だけだと「今どのバージョンで動いているか」が読めず、上げ時の判断ができない。
    const yaml = readFileSync(WORKFLOW, "utf8");
    const pinned = [...yaml.matchAll(/uses:\s*[^@\s]+@[0-9a-f]{40}(.*)$/gm)];
    expect(pinned.length).toBe(refs.length);
    for (const match of pinned) {
      expect((match[1] ?? "").trim()).toMatch(/^#\s*v?\d+\.\d+\.\d+/);
    }
  });
});
