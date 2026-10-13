// @vitest-environment node
//
// Edge Function が `npm:` で取り込む依存の版が、すべて固定(例: `@2.117.3`)されていることを検査する(#204)。
// `@2` のような範囲指定だと、デプロイのたびに最新の 2.x を取り込み、手元でテストした版と違うものが
// 本番の通知(リマインド・パートナー通知)で動きうる。デプロイは手動で、動作確認も本番でしかできないため、
// 版は明示して、上げるときは意図して上げる(上げたら再デプロイが要る: docs/push-notifications-setup.md)。
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
// あさノート(ルートの supabase/functions)とよるノート(apps/yoru/supabase/functions)の両方。
const FUNCTION_DIRS = ["supabase/functions", "apps/yoru/supabase/functions"];

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

const specifiers = FUNCTION_DIRS.flatMap((dir) =>
  sourceFiles(join(ROOT, dir)).flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/["'](npm:[^"']+)["']/g)].map((m) => ({
      file: file.slice(ROOT.length + 1),
      specifier: m[1] ?? "",
    }))
  )
);

describe("Edge Function の依存(npm:)の版の固定(#204)", () => {
  it("npm: の取り込みを検出できている(あさノート・よるノートの4関数が、supabase-js と web-push を使う)", () => {
    // 正規表現やディレクトリが壊れて、何も検査せずに通るのを防ぐ。
    expect(specifiers.filter((s) => s.specifier.startsWith("npm:@supabase/supabase-js@"))).toHaveLength(4);
    expect(specifiers.filter((s) => s.specifier.startsWith("npm:web-push@"))).toHaveLength(4);
  });

  it("すべての npm: が、`@2` や `@latest` ではなく、固定した版(x.y.z)を指している", () => {
    for (const { file, specifier } of specifiers) {
      expect(specifier, file).toMatch(/^npm:(@[a-z0-9-]+\/)?[a-z0-9.-]+@\d+\.\d+\.\d+$/);
    }
  });

  it("同じパッケージは、全ての関数で同じ版を使う(あさノートとよるノートで、版がばらけない)", () => {
    const versionsOf = new Map<string, Set<string>>();
    for (const { specifier } of specifiers) {
      const at = specifier.lastIndexOf("@");
      const name = specifier.slice(0, at);
      versionsOf.set(name, (versionsOf.get(name) ?? new Set()).add(specifier.slice(at + 1)));
    }
    for (const [name, versions] of versionsOf) expect([...versions], name).toHaveLength(1);
  });
});
