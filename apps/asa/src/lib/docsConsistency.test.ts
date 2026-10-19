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

describe("apps/asa/docs/SPEC.md の運用ファイル・招待コードの記述(#228・#208)", () => {
  const ROOT = resolve(APP_ROOT, "../../");
  const spec = readFileSync(`${APP_ROOT}docs/SPEC.md`, "utf8");

  it("構成図が、手動適用の cron SQL と .github/workflows の再利用ワークフローを載せている", () => {
    for (const file of ["cron-cleanup-logs.sql", "cron-cleanup-groups.sql"]) {
      expect(existsSync(`${ROOT}/supabase/${file}`), file).toBe(true);
      expect(spec, file).toContain(file);
    }
    for (const file of ["_app-ci.yml", "_db-types-check.yml", "ci-core.yml", "ci-yoru.yml", "db-deploy-yoru.yml"]) {
      expect(existsSync(`${ROOT}/.github/workflows/${file}`), file).toBe(true);
      expect(spec, file).toContain(file);
    }
  });

  it("招待コードの総当たり耐性(Q11)は、許容の判断として記録されている(未決のままにしない)", () => {
    expect(spec).toContain("**許容する（Q11、オーナー判断、#208）**");
    expect(spec).not.toContain("**要確認 Q11**");
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

  it("analytics_events は365日で消す。schema.sql・運用手順書・SPEC の数値が一致する(#199)", () => {
    expect(schema).toMatch(/delete from analytics_events\s+where created_at < now\(\) - interval '365 days'/);
    expect(doc).toContain("**365日**");
    const spec = readFileSync(`${ROOT}/apps/asa/docs/SPEC.md`, "utf8");
    expect(spec).toContain("`analytics_events` は365日");
    expect(spec).toContain("**365日で掃除**");
    expect(spec).not.toContain("`analytics_events` の保持期間は決まっていない");
    expect(doc).not.toContain("自動では消さない");
  });

  it("cleanup_old_logs() の戻り値の列が、schema.sql・型定義(database.types.ts)・運用手順書で一致する(#199)", () => {
    // 戻り値の列を変えるには、create or replace ではなく drop が要る(先に drop している)。
    expect(schema).toContain("drop function if exists cleanup_old_logs();\ncreate function cleanup_old_logs()");
    expect(schema).toContain(
      "returns table (deleted_client_errors integer, deleted_reminder_deliveries integer, deleted_analytics_events integer)"
    );
    const types = readFileSync(`${APP_ROOT}src/lib/db/database.types.ts`, "utf8");
    const block = /cleanup_old_logs: \{[\s\S]*?\}\[\]/.exec(types)?.[0] ?? "";
    for (const column of ["deleted_client_errors", "deleted_reminder_deliveries", "deleted_analytics_events"]) {
      expect(block, column).toContain(column);
      expect(doc, column).toContain(column);
    }
  });

  it("analytics_events.properties に2000字の上限(not valid。既存の行は検査しない)があり、手順書に載っている(#199)", () => {
    expect(schema).toContain("alter table analytics_events drop constraint if exists analytics_events_properties_check;");
    expect(schema).toMatch(
      /add constraint analytics_events_properties_check\s+check \(char_length\(properties::text\) <= 2000\) not valid;/
    );
    expect(doc).toContain("analytics_events_properties_check");
    expect(doc).toContain("既存の行は検査しない");
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

  it("SPEC の Q6 は、過去メモの本番DBへの取り込みを「実行済み」と書いている(オーナー確認済み。未了のままにしない)", () => {
    const q6 = spec.match(/\| Q6 \|[^\n]*/)?.[0] ?? "";
    expect(q6).toContain("実行済み");
    expect(q6).not.toContain("未了(Issue");
    expect(q6).not.toContain("要確認");
  });

  it("MONOREPO.md の Vercel の本番 URL の表は、オーナーが確認した URL と一致する(取り違えを戻さない。#228)", () => {
    // あさノート=asa-note.vercel.app、よるノート=yorunote-mm.vercel.app(オーナーが共有した URL、2026-10-13)。
    const monorepo = readFileSync(`${ROOT}/docs/MONOREPO.md`, "utf8");
    expect(monorepo).toMatch(/^\| あさノート \| `asa-note` \| `asa-note\.vercel\.app` \|.*`apps\/asa`/m);
    expect(monorepo).toMatch(/^\| よるノート \| `yoru-note` \| `yorunote-mm\.vercel\.app` \|.*`apps\/yoru`/m);
    // 取り違えていた頃の記述(asa-note.vercel.app をよるノートの URL とする、存在しない go-to-school-one)を戻さない。
    expect(monorepo).not.toContain("go-to-school-one");
    expect(monorepo).toContain("https://yorunote-mm.vercel.app/**");
  });

  it("あさノートの SPEC の Vercel の記述は、MONOREPO.md の表(プロジェクト名 asa-note)と食い違わない(#228)", () => {
    const asaSpec = readFileSync(`${ROOT}/apps/asa/docs/SPEC.md`, "utf8");
    expect(asaSpec).toContain("プロジェクト名 `asa-note`");
    expect(asaSpec).not.toMatch(/プロジェクト名 `go-to-school`/);
  });

  it("手順書の期待結果は、子どもの名前を書かない一般的な表現になっている(SPEC §6: 子ども名はハードコードしない)", () => {
    // 実名そのものを、このテストに書いてはいけない(公開リポジトリのため)。名前を書かない表現が
    // 残っていることを、肯定形で検査する。名前を戻すと、この行が書き換わって失敗する。
    const doc = readFileSync(`${YORU}/docs/device-verification.md`, "utf8");
    expect(doc).toContain("期待: あさノートで登録済みのグループと子どもが表示される。");
  });
});
