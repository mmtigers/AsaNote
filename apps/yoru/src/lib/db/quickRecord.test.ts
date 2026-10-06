import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./sync", () => ({ syncPendingChanges: vi.fn() }));

import { localDb } from "./localDb";
import { appendQuickLine, formatClock, saveQuickRecord } from "./quickRecord";

const AT = new Date(2026, 9, 5, 20, 5);

beforeEach(async () => {
  await Promise.all(localDb.tables.map((t) => t.clear()));
});

describe("appendQuickLine", () => {
  it("空メモなら1行、あれば改行して追記する", () => {
    expect(appendQuickLine(null, "20:05", "rough")).toBe("20:05 少し荒れた");
    expect(appendQuickLine("宿題でもめた", "20:05", "storm")).toBe("宿題でもめた\n20:05 大荒れ");
  });

  it("上限を超えたら古い側を捨てる", () => {
    const out = appendQuickLine("あ".repeat(2000), "20:05", "rough");
    expect(out.length).toBe(2000);
    expect(out.endsWith("20:05 少し荒れた")).toBe(true);
  });
});

describe("formatClock", () => {
  it("ゼロ埋めする", () => expect(formatClock(new Date(2026, 0, 1, 7, 3))).toBe("07:03"));
});

describe("saveQuickRecord", () => {
  it("記録が無ければ新規作成する", async () => {
    await saveQuickRecord({ outcome: "rough", recordDate: "2026-10-05", userId: "u1", childId: null, now: AT });
    const all = await localDb.records.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ outcome: "rough", memo: "20:05 少し荒れた", userId: "u1", syncStatus: "pending" });
  });

  it("既存記録には追記し、様子は重い方を保つ", async () => {
    await saveQuickRecord({ outcome: "storm", recordDate: "2026-10-05", userId: "u1", childId: null, now: AT });
    await saveQuickRecord({ outcome: "rough", recordDate: "2026-10-05", userId: "u1", childId: null, now: new Date(2026, 9, 5, 20, 40) });
    const all = await localDb.records.toArray();
    expect(all).toHaveLength(1);
    expect(all[0]?.outcome).toBe("storm");
    expect(all[0]?.memo).toBe("20:05 大荒れ\n20:40 少し荒れた");
  });

  it("穏やかで保存済みの記録は荒れに更新する", async () => {
    await saveQuickRecord({ outcome: "rough", recordDate: "2026-10-05", userId: "u1", childId: null, now: AT });
    const rec = await localDb.records.toArray();
    await localDb.records.update(rec[0]!.id, { outcome: "calm" });
    await saveQuickRecord({ outcome: "rough", recordDate: "2026-10-05", userId: "u1", childId: null, now: AT });
    expect((await localDb.records.toArray())[0]?.outcome).toBe("rough");
  });
});
