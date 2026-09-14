import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalData, localDb, type LocalRecord } from "./localDb";
import { pullFromCloud, syncPendingChanges } from "./sync";

const authGetUser = vi.fn();
const fromMock = vi.fn();
const reportSyncOutcome = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: { getUser: authGetUser },
    from: fromMock,
  }),
}));

vi.mock("./syncStatus", () => ({
  reportSyncOutcome: (...args: unknown[]) => reportSyncOutcome(...args),
}));

function makeLocalRecord(overrides: Partial<LocalRecord> = {}): LocalRecord {
  return {
    id: "r1",
    recordDate: "2026-09-14",
    outcome: null,
    wakeTime: null,
    wakeTags: [],
    triggerTags: [],
    reasonTags: [],
    responseTags: [],
    departTime: null,
    companion: null,
    handoff: null,
    memo: null,
    userId: null,
    createdAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
    syncStatus: "pending",
    ...overrides,
  };
}

function makeCloudRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cloud-1",
    user_id: "user-2",
    record_date: "2026-09-14",
    outcome: null,
    wake_time: null,
    wake_tags: [],
    trigger_tags: [],
    reason_tags: [],
    response_tags: [],
    depart_time: null,
    companion: null,
    handoff: null,
    memo: null,
    created_at: "2026-09-14T00:00:00.000Z",
    updated_at: "2026-09-14T00:00:00.000Z",
    ...overrides,
  };
}

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", { value: online, configurable: true });
}

function mockRecordsTable(overrides: { upsert?: unknown; select?: unknown; delete?: unknown } = {}) {
  fromMock.mockImplementation((table: string) => {
    if (table !== "records") return {};
    return {
      upsert: overrides.upsert ?? vi.fn().mockResolvedValue({ error: null }),
      select: overrides.select ?? vi.fn().mockResolvedValue({ data: [], error: null }),
      delete: overrides.delete ?? (() => ({ in: vi.fn().mockResolvedValue({ error: null }) })),
    };
  });
}

beforeEach(async () => {
  await clearLocalData();
  authGetUser.mockReset();
  fromMock.mockReset();
  reportSyncOutcome.mockReset();
  setOnline(true);
  authGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("syncPendingChanges", () => {
  it("オフライン時はSupabaseを呼ばず、pendingのまま残す", async () => {
    setOnline(false);
    await localDb.records.add(makeLocalRecord());

    await syncPendingChanges();

    expect(fromMock).not.toHaveBeenCalled();
    expect((await localDb.records.get("r1"))?.syncStatus).toBe("pending");
    expect(reportSyncOutcome).not.toHaveBeenCalled();
  });

  it("未ログインの場合は同期を行わない", async () => {
    authGetUser.mockResolvedValue({ data: { user: null } });
    await localDb.records.add(makeLocalRecord());

    await syncPendingChanges();

    expect(fromMock).not.toHaveBeenCalled();
    expect(reportSyncOutcome).not.toHaveBeenCalled();
  });

  it("送信するものが無い場合は結果を報告しない", async () => {
    await syncPendingChanges();

    expect(reportSyncOutcome).not.toHaveBeenCalled();
  });

  it("一括upsertが成功した場合、pendingの記録をsyncedへ更新し、成功を報告する", async () => {
    await localDb.records.add(makeLocalRecord({ id: "r1" }));
    await localDb.records.add(makeLocalRecord({ id: "r2" }));
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockRecordsTable({ upsert });

    await syncPendingChanges();

    expect(upsert).toHaveBeenCalledTimes(1);
    expect((await localDb.records.get("r1"))?.syncStatus).toBe("synced");
    expect((await localDb.records.get("r2"))?.syncStatus).toBe("synced");
    expect(reportSyncOutcome).toHaveBeenCalledWith(true);
  });

  it("一括upsertが失敗した場合、1件ずつ再試行し、失敗した行だけpendingのまま残し、失敗を報告する", async () => {
    await localDb.records.add(makeLocalRecord({ id: "ok" }));
    await localDb.records.add(makeLocalRecord({ id: "ng" }));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const upsert = vi.fn((payload: unknown) => {
      if (Array.isArray(payload)) {
        return Promise.resolve({ error: new Error("bulk failed") });
      }
      const row = payload as { id: string };
      if (row.id === "ng") return Promise.resolve({ error: new Error("row failed") });
      return Promise.resolve({ error: null });
    });
    mockRecordsTable({ upsert });

    await syncPendingChanges();

    expect((await localDb.records.get("ok"))?.syncStatus).toBe("synced");
    expect((await localDb.records.get("ng"))?.syncStatus).toBe("pending");
    expect(warnSpy).toHaveBeenCalled();
    expect(reportSyncOutcome).toHaveBeenCalledWith(false);
    warnSpy.mockRestore();
  });

  it("削除の同期が成功した場合、pendingRecordDeletesから取り除く", async () => {
    await localDb.pendingRecordDeletes.add({ id: "del-1" });
    const del = vi.fn().mockResolvedValue({ error: null });
    mockRecordsTable({ delete: () => ({ in: del }) });

    await syncPendingChanges();

    expect(del).toHaveBeenCalledWith("id", ["del-1"]);
    expect(await localDb.pendingRecordDeletes.count()).toBe(0);
  });

  it("削除の同期が失敗した場合、pendingRecordDeletesに残したまま再試行できるようにし、失敗を報告する", async () => {
    await localDb.pendingRecordDeletes.add({ id: "del-1" });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const del = vi.fn().mockResolvedValue({ error: new Error("delete failed") });
    mockRecordsTable({ delete: () => ({ in: del }) });

    await syncPendingChanges();

    expect(await localDb.pendingRecordDeletes.get("del-1")).toEqual({ id: "del-1" });
    expect(reportSyncOutcome).toHaveBeenCalledWith(false);
    warnSpy.mockRestore();
  });

  it("実行中に再度呼び出しても多重実行しない", async () => {
    await localDb.records.add(makeLocalRecord({ id: "r1" }));
    let resolveUpsert!: (value: { error: null }) => void;
    const upsertPromise = new Promise<{ error: null }>((resolve) => {
      resolveUpsert = resolve;
    });
    const upsert = vi.fn(() => upsertPromise);
    mockRecordsTable({ upsert });

    const first = syncPendingChanges();
    const second = syncPendingChanges();
    resolveUpsert({ error: null });
    await Promise.all([first, second]);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect((await localDb.records.get("r1"))?.syncStatus).toBe("synced");
  });
});

describe("pullFromCloud", () => {
  it("ローカルが未同期(pending)の記録はクラウドの値で上書きしない", async () => {
    await localDb.records.add(makeLocalRecord({ id: "r1", memo: "ローカル未送信の変更" }));
    mockRecordsTable({
      select: vi.fn().mockResolvedValue({
        data: [makeCloudRow({ id: "r1", memo: "クラウドの古い値" })],
        error: null,
      }),
    });

    await pullFromCloud();

    expect((await localDb.records.get("r1"))?.memo).toBe("ローカル未送信の変更");
  });

  it("削除待ち(pendingRecordDeletes)の行はクラウドの値で復元しない", async () => {
    await localDb.pendingRecordDeletes.add({ id: "r1" });
    mockRecordsTable({
      select: vi.fn().mockResolvedValue({ data: [makeCloudRow({ id: "r1" })], error: null }),
    });

    await pullFromCloud();

    expect(await localDb.records.get("r1")).toBeUndefined();
  });

  it("クラウド側から見えなくなった同期済み記録をローカルからも削除する", async () => {
    await localDb.records.add(makeLocalRecord({ id: "stale", syncStatus: "synced" }));
    mockRecordsTable({ select: vi.fn().mockResolvedValue({ data: [], error: null }) });

    await pullFromCloud();

    expect(await localDb.records.get("stale")).toBeUndefined();
  });

  it("未同期(pending)の記録は、クラウドから見えなくても削除しない", async () => {
    await localDb.records.add(makeLocalRecord({ id: "own-draft", syncStatus: "pending" }));
    mockRecordsTable({ select: vi.fn().mockResolvedValue({ data: [], error: null }) });

    await pullFromCloud();

    expect(await localDb.records.get("own-draft")).toBeDefined();
  });

  it("クラウドの記録をローカルへ取り込み、成功を報告する", async () => {
    mockRecordsTable({
      select: vi.fn().mockResolvedValue({
        data: [makeCloudRow({ id: "cloud-1", user_id: "user-2", outcome: "smooth" })],
        error: null,
      }),
    });

    await pullFromCloud();

    const stored = await localDb.records.get("cloud-1");
    expect(stored?.syncStatus).toBe("synced");
    expect(stored?.userId).toBe("user-2");
    expect(reportSyncOutcome).toHaveBeenCalledWith(true);
  });

  it("pullが失敗した場合、失敗を報告する", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockRecordsTable({
      select: vi.fn().mockResolvedValue({ data: null, error: new Error("select failed") }),
    });

    await pullFromCloud();

    expect(reportSyncOutcome).toHaveBeenCalledWith(false);
    warnSpy.mockRestore();
  });

  it("オフライン時はSupabaseを呼ばず、結果も報告しない", async () => {
    setOnline(false);

    await pullFromCloud();

    expect(fromMock).not.toHaveBeenCalled();
    expect(reportSyncOutcome).not.toHaveBeenCalled();
  });

  it("未ログインの場合は結果を報告しない", async () => {
    authGetUser.mockResolvedValue({ data: { user: null } });

    await pullFromCloud();

    expect(fromMock).not.toHaveBeenCalled();
    expect(reportSyncOutcome).not.toHaveBeenCalled();
  });
});
