// @vitest-environment node
//
// このリポジトリの vitest 既定環境は jsdom だが、jsdom では import.meta.url が
// file: URL にならず fileURLToPath が落ちる。ファイルを読むだけの検査なので
// このファイルだけ node 環境に切り替える。
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

describe("実Supabase E2E(e2e-supabase.yml)の skip の見える化(#198)", () => {
  // Secrets 未設定だと全ステップが skip され、緑のまま「実行された」ように見える。
  // 未実行であることを warning と job summary に出す設計を、うっかり戻さないよう固定する。
  const yaml = readFileSync(`${WORKFLOWS_DIR}e2e-supabase.yml`, "utf8");

  it("skip 時に ::warning:: を出している(::notice:: のままではない)", () => {
    expect(yaml).toContain("::warning::実SupabaseのE2Eは実行されていません");
    expect(yaml).not.toContain("::notice::実SupabaseのE2E");
  });

  it("skip 時に job summary(GITHUB_STEP_SUMMARY)へ「未実行」を書いている", () => {
    expect(yaml).toContain("GITHUB_STEP_SUMMARY");
    expect(yaml).toContain("実Supabase E2E は未実行");
  });
});

describe("本番DBへの反映ワークフローの concurrency(#203)", () => {
  // あさノート・よるノートは同じ本番DB(SUPABASE_DB_URL)へ DDL を流す。
  // group 名が別だと、両方の schema.sql を変えた PR のマージで同時に走ってしまう。
  const group = (name: string) =>
    readFileSync(`${WORKFLOWS_DIR}${name}`, "utf8").match(/concurrency:\s*\n\s*group:\s*(\S+)/)?.[1];

  it("db-deploy.yml と db-deploy-yoru.yml は同じ concurrency group で直列化されている", () => {
    expect(group("db-deploy.yml")).toBeTruthy();
    expect(group("db-deploy-yoru.yml")).toBe(group("db-deploy.yml"));
  });

  it("どちらも途中で打ち切らない(cancel-in-progress: false)", () => {
    for (const name of ["db-deploy.yml", "db-deploy-yoru.yml"]) {
      expect(readFileSync(`${WORKFLOWS_DIR}${name}`, "utf8")).toMatch(/cancel-in-progress:\s*false/);
    }
  });
});

describe("PR テンプレート(#205)", () => {
  // CI が強制しないルール(SPEC の更新・手動デプロイなど)を、PR を出すときに思い出せるようにする。
  const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
  const template = readFileSync(`${ROOT}.github/pull_request_template.md`, "utf8");

  it("CI が強制しないルールのチェック項目を含む", () => {
    for (const keyword of ["SPEC.md", "db:types", "手動", "releases.ts", "release-note"]) {
      expect(template).toContain(keyword);
    }
  });

  it("参照している docs のパスが実在する(リンク切れを防ぐ)", () => {
    const paths = [...template.matchAll(/`((?:apps\/asa\/)?docs\/[\w.-]+\.md)`/g)].map((m) => m[1] ?? "");
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(existsSync(`${ROOT}${path}`), path).toBe(true);
    }
  });
});

describe("Actions の分数を減らす構成(#209)", () => {
  // Actions は1ジョブごとに1分単位で切り上げて課金する(無料枠は月2,000分)。
  // 数秒で終わる「判定だけ」のジョブを別ジョブに戻すと、1回の実行ごとに無駄な1分が積み上がる。
  const appCi = readFileSync(`${WORKFLOWS_DIR}_app-ci.yml`, "utf8");

  it("更新履歴の検査は別ジョブではなく、lint-build-test の step になっている", () => {
    expect(appCi).not.toMatch(/^ {2}release-notes-check:/m);
    expect(appCi).toContain("- name: Release notes check");
  });

  it("更新履歴の検査は、BASE との差分を見るため全履歴を取り、依存の導入より前に走る", () => {
    expect(appCi).toMatch(/fetch-depth:\s*0/);
    expect(appCi.indexOf("- name: Release notes check")).toBeGreaterThan(0);
    expect(appCi.indexOf("- name: Release notes check")).toBeLessThan(appCi.indexOf("- name: Install dependencies"));
  });

  it("実Supabase E2E は、リポジトリ変数が有効でなければジョブごと起動しない(step で飛ばすだけでは課金される)", () => {
    const e2e = readFileSync(`${WORKFLOWS_DIR}e2e-supabase.yml`, "utf8");
    expect(e2e).toMatch(/^ {4}if: \$\{\{ vars\.E2E_SUPABASE_ENABLED == 'true' \}\}$/m);
  });
});
