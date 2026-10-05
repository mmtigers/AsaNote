import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./sync", () => ({ syncPendingChanges: vi.fn() }));

import { localDb } from "./localDb";
import { countUnsyncedChanges, deleteRecord, findLatestOwnRecordForDate, saveRecord, type RecordFormInput } from "./records";

const BASE: RecordFormInput = {
  id: "r1",
  recordDate: "2026-10-05",
  outcome: "calm",
  times: {},
  dinner: null,
  dinnerWhy: [],
  free: [],
  friend: [],
  trigger: [],
  behavior: [],
  response: [],
  responseEffect: null,
  body: [],
  memo: null,
  childId: null,
};

beforeEach(async () => {
  await Promise.all(localDb.tables.map((t) => t.clear()));
});

afterEach(() => vi.clearAllMocks());

describe("saveRecord", () => {
  it("pending で保存し、再保存しても createdAt は初回のまま", async () => {
    await saveRecord(BASE);
    const first = await localDb.records.get("r1");
    expect(first?.syncStatus).toBe("pending");

    await saveRecord({ ...BASE, outcome: "rough" });
    const second = await localDb.records.get("r1");
    expect(second?.outcome).toBe("rough");
    expect(second?.createdAt).toBe(first?.createdAt);
  });

  it("空白だけのメモは null にする", async () => {
    await saveRecord({ ...BASE, memo: "   " });
    expect((await localDb.records.get("r1"))?.memo).toBeNull();
  });

  it("同期後に付いた userId を編集の保存で落とさない", async () => {
    await localDb.records.put({ ...BASE, userId: "u1", createdAt: "x", updatedAt: "x", syncStatus: "synced" });
    await saveRecord({ ...BASE, userId: undefined });
    expect((await localDb.records.get("r1"))?.userId).toBe("u1");
  });
});

describe("deleteRecord", () => {
  it("記録と写真を消し、リモート削除と写真の実体の削除をキューに積む", async () => {
    await saveRecord(BASE);
    await localDb.photos.put({ id: "p1", recordId: "r1", storagePath: "u1/r1/p1.jpg", createdAt: "x", syncStatus: "synced" });
    await localDb.photos.put({ id: "p2", recordId: "r1", storagePath: "", createdAt: "x", syncStatus: "pending" });

    await deleteRecord("r1");

    expect(await localDb.records.get("r1")).toBeUndefined();
    expect(await localDb.photos.count()).toBe(0);
    expect((await localDb.pendingRecordDeletes.toArray()).map((d) => d.id)).toEqual(["r1"]);
    // 未アップロードの写真(パスなし)はクラウドに無いので、実体の削除は積まない
    expect(await localDb.pendingPhotoDeletes.toArray()).toEqual([{ id: "p1", storagePath: "u1/r1/p1.jpg" }]);
  });
});

describe("findLatestOwnRecordForDate", () => {
  it("同じ日・同じ子どもの自分の記録のうち、最新のものを返す", async () => {
    const put = (id: string, childId: string | null, userId: string | null, updatedAt: string) =>
      localDb.records.put({ ...BASE, id, childId, userId, createdAt: updatedAt, updatedAt, syncStatus: "synced" });
    await put("a", "c1", "me", "2026-10-05T10:00:00Z");
    await put("b", "c1", "me", "2026-10-05T11:00:00Z");
    await put("c", "c2", "me", "2026-10-05T12:00:00Z");
    await put("d", "c1", "partner", "2026-10-05T13:00:00Z");

    expect((await findLatestOwnRecordForDate("2026-10-05", "me", "c1"))?.id).toBe("b");
  });
});

describe("countUnsyncedChanges", () => {
  it("未送信の記録・写真と、未反映の削除の合計", async () => {
    await saveRecord(BASE);
    await localDb.photos.put({ id: "p1", recordId: "r1", createdAt: "x", storagePath: "", syncStatus: "pending" });
    await localDb.pendingRecordDeletes.put({ id: "z" });
    await localDb.pendingPhotoDeletes.put({ id: "q", storagePath: "u/r/q.jpg" });
    expect(await countUnsyncedChanges()).toBe(4);
  });
});
