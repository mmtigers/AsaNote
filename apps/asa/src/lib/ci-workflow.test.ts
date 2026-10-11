// @vitest-environment node
//
// このリポジトリの vitest 既定環境は jsdom だが、jsdom では import.meta.url が
// file: URL にならず fileURLToPath が落ちる。ファイルを読むだけの検査なので
// このファイルだけ node 環境に切り替える。
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `.github/workflows/*.yml`(あさノート・よるノート・core・DB反映の全ワークフロー)の静的検査(#60・#156)。
 *
 * サードパーティのアクションをメジャータグ(`@v4`)で参照すると、タグは可変なので
 * 同じ `@v4` が後から別のコードを指しうる。`supabase/setup-cli@v1` に至っては
 * `v1` が**タグですらなくブランチ**で、push のたびに中身が変わる。
 *
 * SHA 固定は書いた直後は正しくても、次に誰かがステップを足すときタグ参照に
 * 戻りやすいため、テストで固定する。更新は Dependabot の `github-actions`
 * エコシステムが SHA ごと追随する(`with.version` は対象外なので手動)。
 */

const WORKFLOWS_DIR = fileURLToPath(new URL("../../../../.github/workflows/", import.meta.url));

/** 検査対象のワークフロー(ファイル名 → 中身)。ファイルが増えても自動で対象になる。 */
function workflows(): [string, string][] {
  return readdirSync(WORKFLOWS_DIR)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort()
    .map((name) => [name, readFileSync(`${WORKFLOWS_DIR}${name}`, "utf8")]);
}

/** `uses:` の参照をすべて拾う(`actions/checkout@<ref>` の `<ref>` 部分)。 */
function usesRefs(yaml: string): { action: string; ref: string }[] {
  // このリポジトリの tsconfig は noUncheckedIndexedAccess が有効なので、
  // キャプチャグループの参照は undefined を潰してから返す。
  return [...yaml.matchAll(/uses:\s*([^@\s]+)@(\S+)/g)].map((m) => ({
    action: m[1] ?? "",
    ref: m[2] ?? "",
  }));
}

describe(".github/workflows のアクション参照", () => {
  it("ワークフローを検出できている(あさノート・よるノート・共通・core・DB反映)", () => {
    const names = workflows().map(([name]) => name);
    expect(names).toEqual(
      expect.arrayContaining(["ci.yml", "ci-yoru.yml", "ci-core.yml", "_app-ci.yml", "db-deploy.yml", "db-deploy-yoru.yml"]),
    );
  });

  describe.each(workflows())("%s", (_name, yaml) => {
    const refs = usesRefs(yaml);

    it("uses: を1つ以上検出できている(正規表現が壊れていないことの確認)", () => {
      expect(refs.length).toBeGreaterThan(0);
    });

    it.each(refs)("$action が 40 桁のコミットSHAで固定されている", ({ ref }) => {
      expect(ref).toMatch(/^[0-9a-f]{40}$/);
    });

    it("固定した SHA の横に、どのバージョンかを示すコメントが付いている", () => {
      // SHA だけだと「今どのバージョンで動いているか」が読めず、上げ時の判断ができない。
      const pinned = [...yaml.matchAll(/uses:\s*[^@\s]+@[0-9a-f]{40}(.*)$/gm)];
      expect(pinned.length).toBe(refs.length);
      for (const match of pinned) {
        expect((match[1] ?? "").trim()).toMatch(/^#\s*v?\d+\.\d+\.\d+/);
      }
    });
  });
});

describe("DBスキーマを適用するワークフローの psql(#196)", () => {
  // psql -f は ON_ERROR_STOP が無いと、SQL がエラーでも終了コード 0 になる。
  // そのまま CI が緑になり、壊れた schema.sql が本番反映の段階で初めて落ちる。
  it.each(workflows().filter(([, yaml]) => /^[^#\n]*\bpsql\b[^\n]*\s-f\s/m.test(yaml)))(
    "%s の psql -f は、すべて ON_ERROR_STOP=1 を付けている",
    (_name, yaml) => {
      const commands = yaml.split("\n").filter((line) => !line.trim().startsWith("#") && /\bpsql\b[^\n]*\s-f\s/.test(line));
      expect(commands.length).toBeGreaterThan(0);
      for (const line of commands) {
        expect(line).toContain("ON_ERROR_STOP=1");
      }
    },
  );
});
