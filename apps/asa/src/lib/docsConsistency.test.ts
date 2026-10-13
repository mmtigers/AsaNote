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

describe("apps/yoru の README・SPEC・docs(#228)", () => {
  const ROOT = resolve(APP_ROOT, "../../");
  const YORU = `${ROOT}/apps/yoru`;
  const readme = readFileSync(`${YORU}/README.md`, "utf8");
  const spec = readFileSync(`${YORU}/docs/SPEC.md`, "utf8");

  // Markdown の相対リンク(#以降のアンカーは除く)。外部URL・同一ページ内のアンカーは対象外。
  const relativeLinks = (md: string) => [...md.matchAll(/\]\((\.{1,2}\/[^)#\s]+)/g)].map((m) => m[1] ?? "");

  it("README・SPEC・docs の相対リンク先が実在する", () => {
    for (const file of ["README.md", "docs/SPEC.md", "docs/push-notifications-setup.md", "docs/device-verification.md"]) {
      const md = readFileSync(`${YORU}/${file}`, "utf8");
      for (const link of relativeLinks(md)) {
        expect(existsSync(resolve(dirname(`${YORU}/${file}`), link)), `${file}: ${link}`).toBe(true);
      }
    }
    expect(relativeLinks(readme).length).toBeGreaterThan(0);
  });

  it("あさノートの README の見出しへのリンクは、実在する見出しを指す", () => {
    const asaReadme = readFileSync(`${APP_ROOT}README.md`, "utf8");
    // GitHub の見出しのアンカー: 記号(全角の括弧など)を除いた文字列
    const anchors = [...asaReadme.matchAll(/^#+ (.+)$/gm)].map((m) => (m[1] ?? "").replace(/[()（）\s]/g, ""));
    for (const md of [readme, spec]) {
      for (const m of md.matchAll(/\]\((?:\.{1,2}\/)+asa\/README\.md#([^)\s]+)\)/g)) {
        expect(anchors, m[1]).toContain(decodeURIComponent(m[1] ?? ""));
      }
    }
  });

  it("セットアップは npm ci(運用・ルート README と同じ)", () => {
    expect(readme).toContain("npm ci");
    expect(readme).not.toMatch(/^npm install\b/m);
  });

  it("本番DBへの自動適用は、よるノート用のワークフロー(db-deploy-yoru.yml)を案内している", () => {
    expect(readme).toContain("db-deploy-yoru.yml");
    expect(readme).not.toMatch(/`\.github\/workflows\/db-deploy\.yml`/);
    expect(existsSync(`${ROOT}/.github/workflows/db-deploy-yoru.yml`)).toBe(true);
  });

  it("SPEC の「### N.M」の節番号が重複していない", () => {
    const numbers = [...spec.matchAll(/^### (\d+\.\d+) /gm)].map((m) => m[1] ?? "");
    expect(numbers.length).toBeGreaterThan(0);
    expect(numbers.filter((n, i) => numbers.indexOf(n) !== i)).toEqual([]);
  });

  it("SPEC の決定事項(Q3)は、本文(§6)の「廃止」と食い違わない", () => {
    expect(spec).toContain("兄弟への共通項目のコピー機能は廃止した");
    expect(spec).not.toMatch(/\| Q3 \|[^\n]*\*\*第2段階\*\*/);
  });

  it("schema.sql の reminder_time の既定値とコメントが、SPEC の決定事項(§10 Q5)と一致する", () => {
    const schema = readFileSync(`${YORU}/supabase/schema.sql`, "utf8");
    const specTime = /\| Q5 \|[^\n]*\*\*(\d{1,2}:\d{2})\*\*/.exec(spec)?.[1];
    expect(specTime).toBeDefined();
    expect(schema).toContain(`reminder_time time not null default '${specTime}'`);
    // コメントの参照先は、既定時刻を決めた §10 Q5(§4 は画面の章で、時刻の決定は書かれていない)
    expect(schema).toContain(`reminder_time の既定は${specTime}(SPEC §10 Q5)`);
  });

  it("SPEC の Q6 は、無関係な Issue(#16)を未了の根拠として参照していない", () => {
    expect(spec.match(/\| Q6 \|[^\n]*/)?.[0] ?? "").not.toContain("(Issue #16)");
  });

  it("手順書の期待結果は、子どもの名前を書かない一般的な表現になっている(SPEC §6: 子ども名はハードコードしない)", () => {
    // 実名そのものを、このテストに書いてはいけない(公開リポジトリのため)。名前を書かない表現が
    // 残っていることを、肯定形で検査する。名前を戻すと、この行が書き換わって失敗する。
    const doc = readFileSync(`${YORU}/docs/device-verification.md`, "utf8");
    expect(doc).toContain("期待: あさノートで登録済みのグループと子どもが表示される。");
  });
});
