import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 失敗は vi.fn を通さず、素の関数で reject する(membership.test.tsx と同じ。vi.fn が reject した Promise を
// 記録すると、呼び出し側で catch していてもテストの失敗として報告されることがあるため)。
const { calls, behavior } = vi.hoisted(() => ({
  calls: { upsert: [] as unknown[], complete: [] as unknown[] },
  behavior: { upsertError: null as unknown, completeError: null as unknown, photo: null as unknown },
}));
vi.mock("@/lib/db/records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/records")>()),
  upsertOwnRecord: (params: { recordDate: string; userId: string; input: unknown }) => {
    calls.upsert.push(params);
    if (behavior.upsertError) return Promise.reject(behavior.upsertError);
    return Promise.resolve({ id: "r1", userId: params.userId, recordDate: params.recordDate, completedAt: null, updatedAt: "t", ...(params.input as object) });
  },
  completeOwnRecord: (recordDate: string) => {
    calls.complete.push(recordDate);
    if (behavior.completeError) return Promise.reject(behavior.completeError);
    return Promise.resolve({ completedAt: "done-at", photo: behavior.photo });
  },
}));

import { EMPTY_INPUT } from "@/lib/db/records";
import { loadDraft } from "./recordDraft";
import { RecordValidationError, saveDailyRecord } from "./saveRecord";

const NOW = new Date("2026-10-17T03:00:00Z"); // 日本時間 10/17 12:00
const base = { userId: "u1", familyId: "f1", recordDate: "2026-10-17", now: NOW };
const input = { ...EMPTY_INPUT, breakfast: "ate" as const, medication: "taken" as const, memo: "散歩した" };

beforeEach(() => {
  calls.upsert = [];
  calls.complete = [];
  behavior.upsertError = null;
  behavior.completeError = null;
  behavior.photo = null;
});
afterEach(() => window.localStorage.clear());

describe("saveDailyRecord: 保存に失敗したとき", () => {
  it("例外を投げ、入力は下書きとして残る(再試行できる)", async () => {
    behavior.upsertError = new TypeError("Failed to fetch");
    await expect(saveDailyRecord({ ...base, input, complete: true })).rejects.toThrow("Failed to fetch");
    expect(loadDraft("u1", "2026-10-17")?.input).toEqual(input);
  });

  it("保存できていないので、完了にしない", async () => {
    behavior.upsertError = { message: "server error" };
    await expect(saveDailyRecord({ ...base, input, complete: true })).rejects.toBeTruthy();
    expect(calls.complete).toEqual([]);
  });

  it("再試行で保存できたら、下書きは消える", async () => {
    behavior.upsertError = new TypeError("Failed to fetch");
    await expect(saveDailyRecord({ ...base, input, complete: false })).rejects.toBeTruthy();
    behavior.upsertError = null;
    const outcome = await saveDailyRecord({ ...base, input, complete: false });
    expect(outcome.status).toBe("saved");
    expect(loadDraft("u1", "2026-10-17")).toBeNull();
    // 再試行も同じ日付への upsert(1日1件のまま。重複は DB の unique と onConflict で防ぐ)。
    expect(calls.upsert).toHaveLength(2);
  });
});

describe("saveDailyRecord: 保存に成功したとき", () => {
  it("途中保存は、完了にしない", async () => {
    const outcome = await saveDailyRecord({ ...base, input, complete: false });
    expect(outcome.status).toBe("saved");
    expect(calls.complete).toEqual([]);
  });

  it("完了は、保存が成功した後に呼び、写真を返す", async () => {
    behavior.photo = { photoId: "p1", storagePath: "f1/p1.jpg" };
    const outcome = await saveDailyRecord({ ...base, input, complete: true });
    expect(outcome).toMatchObject({ status: "completed", completedAt: "done-at", photo: { photoId: "p1" } });
    expect(calls.upsert).toHaveLength(1);
    expect(calls.complete).toEqual(["2026-10-17"]);
  });

  it("一部が未入力でも、完了にできる", async () => {
    const outcome = await saveDailyRecord({ ...base, input: EMPTY_INPUT, complete: true });
    expect(outcome.status).toBe("completed");
  });

  it("写真が無くても、完了は成功として返す", async () => {
    const outcome = await saveDailyRecord({ ...base, input, complete: true });
    expect(outcome).toMatchObject({ status: "completed", photo: null });
  });

  it("完了だけ失敗したら、保存済みとして返す(記録は失われない。完了は何度呼んでも同じなので再試行できる)", async () => {
    behavior.completeError = new TypeError("Failed to fetch");
    const outcome = await saveDailyRecord({ ...base, input, complete: true });
    expect(outcome.status).toBe("saved-not-completed");
    expect(outcome.record).toMatchObject({ recordDate: "2026-10-17", completedAt: null });
    expect(loadDraft("u1", "2026-10-17")).toBeNull();
  });
});

describe("saveDailyRecord: 送る前の検証", () => {
  it("日本時間で未来の日付は、サーバーへ送らずに拒否する", async () => {
    await expect(saveDailyRecord({ ...base, recordDate: "2026-10-18", input, complete: false })).rejects.toBeInstanceOf(RecordValidationError);
    expect(calls.upsert).toEqual([]);
  });

  it("UTC では前日でも、日本時間で今日なら保存できる", async () => {
    const lateNight = new Date("2026-10-17T15:30:00Z"); // 日本時間 10/18 0:30
    const outcome = await saveDailyRecord({ ...base, recordDate: "2026-10-18", input, complete: false, now: lateNight });
    expect(outcome.status).toBe("saved");
  });

  it("過去の日付は、期間の制限なく保存できる", async () => {
    const outcome = await saveDailyRecord({ ...base, recordDate: "2020-01-01", input, complete: false });
    expect(outcome.status).toBe("saved");
  });

  it("正しくない日付・長すぎるメモは拒否する", async () => {
    await expect(saveDailyRecord({ ...base, recordDate: "2026-02-30", input, complete: false })).rejects.toBeInstanceOf(RecordValidationError);
    await expect(saveDailyRecord({ ...base, input: { ...input, memo: "あ".repeat(2001) }, complete: false })).rejects.toBeInstanceOf(
      RecordValidationError
    );
    expect(calls.upsert).toEqual([]);
  });
});
