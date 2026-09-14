import { beforeEach, describe, expect, it } from "vitest";
import { clearLocalData, localDb } from "./localDb";
import { deleteRecord, findLatestOwnRecordForDate, saveRecord } from "./records";

beforeEach(async () => {
  await clearLocalData();
});

const base = {
  wakeTime: "07:15",
  wakeTags: ["渋々起床"],
  triggerTags: [] as string[],
  reasonTags: ["当番・係が嫌"],
  responseTags: [] as string[],
  departTime: "08:20",
  companion: "一人で",
  handoff: "担任の先生",
  memo: null,
};

describe("saveRecord", () => {
  it("新規保存するとsyncStatus: pendingでローカルに残る", async () => {
    await saveRecord({ id: "r1", recordDate: "2026-09-14", ...base, userId: null });

    const stored = await localDb.records.get("r1");
    expect(stored?.syncStatus).toBe("pending");
    expect(stored?.recordDate).toBe("2026-09-14");
  });

  it("同じidで再保存するとcreatedAtを保持したまま上書きする", async () => {
    await saveRecord({ id: "r1", recordDate: "2026-09-14", ...base, userId: null });
    const first = await localDb.records.get("r1");

    await saveRecord({
      id: "r1",
      recordDate: "2026-09-14",
      ...base,
      memo: "更新後",
      userId: null,
    });
    const second = await localDb.records.get("r1");

    expect(second?.createdAt).toBe(first?.createdAt);
    expect(second?.memo).toBe("更新後");
  });
});

describe("findLatestOwnRecordForDate", () => {
  it("同じ日付・自分の記録がなければundefinedを返す", async () => {
    const found = await findLatestOwnRecordForDate("2026-09-14", "user-1");
    expect(found).toBeUndefined();
  });

  it("同じ日付の自分の記録を返す(パートナーの記録は除外)", async () => {
    await saveRecord({ id: "own", recordDate: "2026-09-14", ...base, userId: "user-1" });
    await saveRecord({ id: "partner", recordDate: "2026-09-14", ...base, userId: "user-2" });

    const found = await findLatestOwnRecordForDate("2026-09-14", "user-1");
    expect(found?.id).toBe("own");
  });
});

describe("deleteRecord", () => {
  it("未同期(pending)の記録は削除キューに積まずそのまま消える", async () => {
    await saveRecord({ id: "r1", recordDate: "2026-09-14", ...base, userId: null });

    await deleteRecord("r1");

    expect(await localDb.records.get("r1")).toBeUndefined();
    expect(await localDb.pendingRecordDeletes.count()).toBe(0);
  });

  it("同期済み(synced)の記録は削除キューに積んで再試行できるようにする", async () => {
    await saveRecord({ id: "r1", recordDate: "2026-09-14", ...base, userId: null });
    await localDb.records.update("r1", { syncStatus: "synced" });

    await deleteRecord("r1");

    expect(await localDb.records.get("r1")).toBeUndefined();
    expect(await localDb.pendingRecordDeletes.get("r1")).toEqual({ id: "r1" });
  });
});
