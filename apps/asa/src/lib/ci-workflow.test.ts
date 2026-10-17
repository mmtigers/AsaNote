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
      expect.arrayContaining(["ci.yml", "ci-yoru.yml", "ci-oya.yml", "ci-core.yml", "_app-ci.yml", "db-deploy.yml", "db-deploy-yoru.yml"]),
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

  // ローカルで型を再生成するスクリプトも同じ(#227)。途中までしか適用されていない DB から型を作ってしまう。
  it("ローカルの型の再生成スクリプト(apps/*/scripts/gen-db-types.sh)の psql -f も、ON_ERROR_STOP=1 を付けている", () => {
    const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
    for (const app of ["asa", "yoru"]) {
      const sh = readFileSync(`${ROOT}apps/${app}/scripts/gen-db-types.sh`, "utf8");
      const commands = sh.split("\n").filter((line) => !line.trim().startsWith("#") && /\bpsql\b[^\n]*\s-f\s/.test(line));
      expect(commands.length, app).toBeGreaterThan(0);
      for (const line of commands) {
        expect(line, app).toContain("ON_ERROR_STOP=1");
      }
    }
  });
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

  // 公開リポジトリは分数が無料のため、判定ジョブを毎回走らせて、未稼働の理由を必ず見えるようにする。
  // (以前は #209 の分数対策で、変数が無いとジョブごと起動せず、警告も summary も出なかった。)
  // 非公開に戻して分数を気にするときは、ジョブに vars の if を足す(#237)。
  it("変数 E2E_SUPABASE_ENABLED が無くても判定ジョブは起動し、未稼働の理由を警告と summary に出す", () => {
    expect(yaml).not.toMatch(/^ {4}if: .*vars\.E2E_SUPABASE_ENABLED/m);
    expect(yaml).toContain("E2E_SUPABASE_ENABLED: ${{ vars.E2E_SUPABASE_ENABLED }}");
    expect(yaml).toContain('"$E2E_SUPABASE_ENABLED" != "true"');
    expect(yaml).toContain("リポジトリ変数 E2E_SUPABASE_ENABLED が true ではありません");
  });

  it("変数が true でないとき、以降のステップ(E2E の実行など)は実行しない", () => {
    // 判定が enabled=true を出す分岐は、変数が true で、かつ Secrets が揃っているときだけ。
    const check = /name: Check secrets are configured[\s\S]*?(?=\n {6}- uses:)/.exec(yaml)?.[0] ?? "";
    expect(check.match(/echo "enabled=true"/g)).toHaveLength(1);
    expect(check).toMatch(/if \[ "\$E2E_SUPABASE_ENABLED" != "true" \][\s\S]*?enabled=false[\s\S]*?elif[\s\S]*?missing[\s\S]*?enabled=false[\s\S]*?else[\s\S]*?enabled=true/);
  });

  it("ドラフトの PR では起動せず(#225・#236 と同じ)、ready にした時にも起動する", () => {
    expect(yaml).toContain("if: ${{ !github.event.pull_request.draft }}");
    expect(yaml).toMatch(/types: \[opened, synchronize, reopened, ready_for_review\]/);
  });
});

describe("実Supabase E2E の準備手順(docs/e2e-supabase.md)と workflow の整合(#198)", () => {
  // 手順どおりに進めても有効にならない(変数の登録が抜けている、Secrets の名前が違う)のを防ぐ。
  const yaml = readFileSync(`${WORKFLOWS_DIR}e2e-supabase.yml`, "utf8");
  const doc = readFileSync(fileURLToPath(new URL("../../docs/e2e-supabase.md", import.meta.url)), "utf8");
  // 「## 用意する手順」から次の「## 」見出しの直前まで。
  const procedure = /^## 用意する手順[\s\S]*?(?=^## )/m.exec(doc)?.[0] ?? "";

  it("workflow が必須と判定している Secrets は、すべて手順の表に載っている", () => {
    const required = /for name in ([A-Z0-9_ ]+); do/.exec(yaml)?.[1]?.split(" ") ?? [];
    expect(required).toHaveLength(6);
    for (const name of required) expect(procedure, name).toContain(`\`${name}\``);
  });

  it("手順に、ジョブを有効にするリポジトリ変数 E2E_SUPABASE_ENABLED=true の登録が含まれる(無いと skipped のまま)", () => {
    expect(yaml).toContain("vars.E2E_SUPABASE_ENABLED == 'true'");
    // 表(`E2E_SUPABASE_ENABLED` | `true`)でも、`E2E_SUPABASE_ENABLED` = `true` の文でもよい。
    expect(procedure).toMatch(/`E2E_SUPABASE_ENABLED`\s*(?:=|\|)\s*`true`/);
  });

  it("CI の表示(skipped / 警告つきの成功 / 実行して成功)の見分け方を載せている", () => {
    expect(doc).toContain("skipped");
    expect(doc).toContain("実SupabaseのE2Eは実行されていません");
    expect(doc).toContain("Run E2E tests against the Supabase test project");
    expect(yaml).toContain("name: Run E2E tests against the Supabase test project");
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

});

describe("バージョンの散在を防ぐ(#206)", () => {
  const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

  it("Node の版は .nvmrc の1か所にあり、全ワークフローの setup-node がそれを読む", () => {
    expect(readFileSync(`${ROOT}.nvmrc`, "utf8").trim()).toMatch(/^\d+$/);
    for (const [name, yaml] of workflows()) {
      // 版を直書き(node-version: 22)すると、.nvmrc を上げたときに取り残される。
      expect(yaml, name).not.toMatch(/node-version:\s*\d/);
      if (yaml.includes("actions/setup-node@")) {
        expect(yaml, name).toContain("node-version-file: .nvmrc");
      }
    }
  });

  it("Supabase CLI(setup-cli)は、再利用ワークフロー _db-types-check.yml の1か所だけで使う", () => {
    const users = workflows().filter(([, yaml]) => yaml.includes("supabase/setup-cli@"));
    expect(users.map(([name]) => name)).toEqual(["_db-types-check.yml"]);
    // 版は固定する(latest は CLI の破壊的変更で CI が突然落ちうる。#60)。
    expect(users[0]?.[1]).toMatch(/version:\s*\d+\.\d+\.\d+/);
  });

  it("あさノート・よるノートの CI は、型ずれの検査を再利用ワークフローから呼ぶ", () => {
    for (const name of ["ci.yml", "ci-yoru.yml"]) {
      const yaml = readFileSync(`${WORKFLOWS_DIR}${name}`, "utf8");
      expect(yaml, name).toContain("uses: ./.github/workflows/_db-types-check.yml");
      expect(yaml, name).not.toContain("supabase gen types");
    }
  });

  it("Playwright の範囲が、あさノート・よるノート・おやノートでそろっている", () => {
    const range = (app: string) =>
      (JSON.parse(readFileSync(`${ROOT}apps/${app}/package.json`, "utf8")) as { devDependencies: Record<string, string> })
        .devDependencies["@playwright/test"];
    expect(range("yoru")).toBe(range("asa"));
    expect(range("oya")).toBe(range("asa"));
  });
});

describe("カバレッジの job summary(#207)", () => {
  // 数値を成果物の中に隠さず、PR の画面から推移が見えるようにする。閾値でのブロックはしない(#60)。
  it("lint-build-test と core の CI が、Coverage summary step を always() で実行する", () => {
    for (const name of ["_app-ci.yml", "ci-core.yml"]) {
      const yaml = readFileSync(`${WORKFLOWS_DIR}${name}`, "utf8");
      expect(yaml, name).toMatch(/- name: Coverage summary\n\s+if: always\(\)\n(?:\s+env:\n\s+APP: .*\n)?\s+run: node \.\.\/\.\.\/scripts\/coverage-summary\.mjs coverage\/coverage-summary\.json/);
    }
  });

  it("vitest の coverage reporter に json-summary がある(あさノート・よるノート・おやノート・core)", () => {
    const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
    for (const dir of ["apps/asa", "apps/yoru", "apps/oya", "packages/core"]) {
      expect(readFileSync(`${ROOT}${dir}/vitest.config.mts`, "utf8"), dir).toContain('"json-summary"');
    }
  });
});

describe("Actions の分数を守るトリガー(#225)", () => {
  // 無料枠(月2,000分)の範囲内で運用する。main への push では走らせず(PR の CI で済ませる)、
  // 関係のない変更では PR でも走らせない。実Supabase E2E と DB 反映は別の仕組みなので対象外。
  const CI_WORKFLOWS = ["ci.yml", "ci-yoru.yml", "ci-oya.yml", "ci-core.yml"];
  const onBlock = (yaml: string) => yaml.slice(yaml.indexOf("\non:"), yaml.indexOf("\nconcurrency:"));

  it("あさノート・よるノート・おやノート・core の CI は、main への push では走らせない", () => {
    for (const name of CI_WORKFLOWS) {
      expect(onBlock(readFileSync(`${WORKFLOWS_DIR}${name}`, "utf8")), name).not.toMatch(/^ {2}push:/m);
    }
  });

  it("どの CI も pull_request に paths を持ち、CI の定義(.github/**)と共通コードを含む", () => {
    for (const name of CI_WORKFLOWS) {
      const block = onBlock(readFileSync(`${WORKFLOWS_DIR}${name}`, "utf8"));
      expect(block, name).toMatch(/^ {4}paths:/m);
      expect(block, name).toContain('".github/**"');
      expect(block, name).toContain('"packages/core/**"');
      expect(block, name).toContain('"package-lock.json"');
    }
  });

  it("アプリの CI は自分のアプリ、core の CI は core を対象にしている", () => {
    expect(onBlock(readFileSync(`${WORKFLOWS_DIR}ci.yml`, "utf8"))).toContain('"apps/asa/**"');
    expect(onBlock(readFileSync(`${WORKFLOWS_DIR}ci-yoru.yml`, "utf8"))).toContain('"apps/yoru/**"');
    expect(onBlock(readFileSync(`${WORKFLOWS_DIR}ci-oya.yml`, "utf8"))).toContain('"apps/oya/**"');
  });
});

describe("ドラフトの PR では CI を走らせない(#225)", () => {
  // ドラフトは作業中で、push のたびに全ジョブ(約5〜11分)を消費していた。ready にした時から走らせる。
  const CI_WORKFLOWS = ["ci.yml", "ci-yoru.yml", "ci-oya.yml", "ci-core.yml"];
  const DRAFT_GUARD = "if: ${{ !github.event.pull_request.draft }}";

  it("あさノート・よるノート・おやノート・core の CI は、すべてのジョブにドラフト除外の if がある", () => {
    for (const name of CI_WORKFLOWS) {
      const yaml = readFileSync(`${WORKFLOWS_DIR}${name}`, "utf8");
      const jobsBlock = yaml.slice(yaml.indexOf("\njobs:"));
      const jobKeys = [...jobsBlock.matchAll(/^ {2}([\w-]+):$/gm)].map((m) => m[1] ?? "");
      expect(jobKeys.length, name).toBeGreaterThan(0);
      for (const key of jobKeys) {
        const start = jobsBlock.indexOf(`\n  ${key}:\n`);
        const next = jobsBlock.slice(start + 1).search(/\n {2}[\w-]+:\n/);
        const body = next < 0 ? jobsBlock.slice(start) : jobsBlock.slice(start, start + 1 + next);
        expect(body, `${name} / ${key}`).toContain(DRAFT_GUARD);
      }
    }
  });

  it("ready にした時(ready_for_review)にも起動する", () => {
    for (const name of CI_WORKFLOWS) {
      const yaml = readFileSync(`${WORKFLOWS_DIR}${name}`, "utf8");
      expect(yaml.slice(yaml.indexOf("\non:"), yaml.indexOf("\nconcurrency:")), name).toContain("ready_for_review");
    }
  });
});
