// @vitest-environment node
//
// pushCommon.ts は、あさノート側(supabase/functions/_shared/pushCommon.ts)が正で、これは複製(#202)。
// よるノート側だけを直してずれたときに、よるノートの CI が気づくための検査(あさノート側の CI にも同じ検査がある)。
// ずれたら、正を直したうえで `node scripts/sync-push-common.mjs` でコピーを作り直す(コピーは直接編集しない)。
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error 型定義の無い .mjs(ルートの scripts/)。
import { checkPushCommon } from "../../../../../scripts/sync-push-common.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

describe("pushCommon.ts の複製(あさノートが正、よるノートがコピー)", () => {
  it("このコピーが、あさノート側の正と同一である(ずれたら `node scripts/sync-push-common.mjs`)", async () => {
    const result = await checkPushCommon(ROOT);
    expect(result, result.reason ?? "").toEqual({ inSync: true, reason: null });
  });
});
