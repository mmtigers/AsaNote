import { beforeEach, describe, expect, it } from "vitest";
import { clearLocalData, localDb } from "./localDb";

beforeEach(async () => {
  await clearLocalData();
});

describe("clearLocalData", () => {
  it("ログアウト時に全テーブルを空にする(共有端末での次ユーザーへの誤同期防止)", async () => {
    await localDb.records.add({
      id: "record-1",
      recordDate: "2026-09-14",
      wakeTime: null,
      wakeTags: [],
      triggerTags: [],
      reasonTags: [],
      responseTags: [],
      departTime: null,
      companion: null,
      handoff: null,
      memo: null,
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
      syncStatus: "pending",
    });
    await localDb.pendingRecordDeletes.add({ id: "record-2" });

    await clearLocalData();

    for (const table of localDb.tables) {
      expect(await table.count(), `${table.name}がクリアされていない`).toBe(0);
    }
  });

  it("Dexieに登録済みの全テーブルを対象にする", async () => {
    const tableNames = localDb.tables.map((table) => table.name).sort();
    expect(tableNames).toEqual(["pendingRecordDeletes", "records"]);
  });
});
