// @vitest-environment node
//
// pushCommon.ts(正はあさノート側)と、よるノート側の複製がずれていないことを検査する(#202)。
// ずれたまま片方だけ直すと、認証(isAuthorizedSecret)や送信まわりの修正が、もう片方に届かない。
// よるノート側の CI でも同じ検査をしている(apps/yoru/supabase/functions/_shared/pushCommonSync.test.ts。
// どちらのアプリだけを直しても、片方の CI が気づく)。
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error 型定義の無い .mjs(ルートの scripts/)。
import { COPY, SOURCE, checkPushCommon, syncPushCommon } from "../../../scripts/sync-push-common.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("pushCommon.ts の複製(あさノートが正、よるノートがコピー)", () => {
  it("よるノート側のコピーが、あさノート側の正と同一である(ずれたら `node scripts/sync-push-common.mjs`)", async () => {
    const result = await checkPushCommon(ROOT);
    expect(result, result.reason ?? "").toEqual({ inSync: true, reason: null });
  });

  it("正のファイルの冒頭に、「正はこちら・コピーは直接編集しない」と書いてある(コピーにも同じ文面が入る)", async () => {
    const source = await readFile(join(ROOT, SOURCE), "utf8");
    expect(source).toContain("このファイルの正は、あさノート側");
    expect(source).toContain("直接編集しない");
    expect(source).toContain("scripts/sync-push-common.mjs");
  });

  describe("スクリプトの動作(使い捨てのディレクトリ)", () => {
    const setup = async (source: string, copy: string | null) => {
      const root = await mkdtemp(join(tmpdir(), "push-common-"));
      await mkdir(join(root, dirname(SOURCE)), { recursive: true });
      await mkdir(join(root, dirname(COPY)), { recursive: true });
      await writeFile(join(root, SOURCE), source);
      if (copy !== null) await writeFile(join(root, COPY), copy);
      return root;
    };

    it("同一なら、ずれていない", async () => {
      const root = await setup("export const a = 1;\n", "export const a = 1;\n");
      expect((await checkPushCommon(root)).inSync).toBe(true);
    });

    it("1文字でも違えば、ずれている(末尾の改行・空白も)", async () => {
      expect((await checkPushCommon(await setup("export const a = 1;\n", "export const a = 2;\n"))).inSync).toBe(false);
      expect((await checkPushCommon(await setup("export const a = 1;\n", "export const a = 1;"))).inSync).toBe(false);
      expect((await checkPushCommon(await setup("export const a = 1;\n", "export const a = 1; \n"))).inSync).toBe(false);
    });

    it("コピーが無ければ、ずれている(理由にパスが出る)", async () => {
      const result = await checkPushCommon(await setup("export const a = 1;\n", null));
      expect(result.inSync).toBe(false);
      expect(result.reason).toContain(COPY);
    });

    it("検査は、ファイルを書き換えない", async () => {
      const root = await setup("export const a = 1;\n", "stale\n");
      await checkPushCommon(root);
      expect(await readFile(join(root, COPY), "utf8")).toBe("stale\n");
    });

    it("同期すると、コピーが正と同一になる(コピーが無い場合も作る)", async () => {
      const stale = await setup("export const a = 1;\n", "stale\n");
      await syncPushCommon(stale);
      expect(await readFile(join(stale, COPY), "utf8")).toBe("export const a = 1;\n");
      expect((await checkPushCommon(stale)).inSync).toBe(true);

      const missing = await setup("export const b = 2;\n", null);
      await syncPushCommon(missing);
      expect((await checkPushCommon(missing)).inSync).toBe(true);
    });
  });
});
