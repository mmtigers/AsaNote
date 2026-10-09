import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLocalData, localDb, type LocalRecord } from "./localDb";
import { PULL_PAGE_SIZE, pullFromCloud, registerSyncListeners, syncPendingChanges } from "./sync";

const authGetUser = vi.fn();
const authGetSession = vi.fn();
const fromMock = vi.fn();
const reportSyncOutcome = vi.fn();

vi.mock("@note/core/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: { getUser: authGetUser, getSession: authGetSession },
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

type SelectImpl = (from: number, to: number) => Promise<{ data: unknown; error: unknown }>;

// pullFromCloud は select("*").order(...).order(...).range(from, to) のチェーンで
// PULL_PAGE_SIZE 件ずつ取得する(#55)。select の差し替えは range(from, to) の時点で
// 呼ばれ、ページ範囲を受け取れる(範囲を無視して全件返すモックは「1ページ目で終わる」扱い)。
function mockRecordsTable(overrides: { upsert?: unknown; select?: SelectImpl; delete?: unknown } = {}) {
  const selectImpl: SelectImpl = overrides.select ?? vi.fn().mockResolvedValue({ data: [], error: null });
  fromMock.mockImplementation((table: string) => {
    if (table !== "records") return {};
    return {
      upsert: overrides.upsert ?? vi.fn().mockResolvedValue({ error: null }),
      select: () => {
        const builder = {
          order: () => builder,
          range: (from: number, to: number) => selectImpl(from, to),
        };
        return builder;
      },
      delete: overrides.delete ?? (() => ({ in: vi.fn().mockResolvedValue({ error: null }) })),
    };
  });
}

beforeEach(async () => {
  await clearLocalData();
  authGetUser.mockReset();
  authGetSession.mockReset().mockResolvedValue({ data: { session: { user: { id: "user-1" } } } });
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

  it("childIdをchild_idとして送信する(複数の子ども対応 #3)", async () => {
    await localDb.records.add(makeLocalRecord({ id: "r1", childId: "child-1" }));
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockRecordsTable({ upsert });

    await syncPendingChanges();

    expect(upsert).toHaveBeenCalledWith([expect.objectContaining({ id: "r1", child_id: "child-1" })]);
  });

  it("childId未設定の記録はchild_id: nullとして送信する", async () => {
    await localDb.records.add(makeLocalRecord({ id: "r1" }));
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockRecordsTable({ upsert });

    await syncPendingChanges();

    expect(upsert).toHaveBeenCalledWith([expect.objectContaining({ id: "r1", child_id: null })]);
  });

  it("condition_scale列は送信しない(サーバーの既存値をnullで上書きして消さない #137)", async () => {
    await localDb.records.add(makeLocalRecord({ id: "r1" }));
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockRecordsTable({ upsert });

    await syncPendingChanges();

    const [rows] = upsert.mock.calls[0] as [Record<string, unknown>[]];
    expect(rows[0]).not.toHaveProperty("condition_scale");
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

describe("前面に戻ったときの取り込み(#125)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T09:00:00+09:00"));
    mockRecordsTable();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function resume() {
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(authGetSession).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  it("通常の pullFromCloud のあと5分未満なら取り込まず、5分以上なら取り込む", async () => {
    const stop = registerSyncListeners();
    await pullFromCloud();
    fromMock.mockClear();

    vi.setSystemTime(Date.now() + 4 * 60 * 1000);
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(authGetSession).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();

    vi.setSystemTime(Date.now() + 2 * 60 * 1000);
    await resume();
    expect(fromMock).toHaveBeenCalledWith("records");
    stop?.();
  });

  it("リスナーを解除すると、取り込まない", async () => {
    const stop = registerSyncListeners();
    stop?.();

    vi.setSystemTime(Date.now() + 10 * 60 * 1000);
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(authGetSession).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
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

  it("サーバーに残るcondition_scale列があっても取り込め、ローカルには持ち込まない(#137)", async () => {
    mockRecordsTable({
      select: vi.fn().mockResolvedValue({
        data: [makeCloudRow({ id: "r-cond", condition_scale: 3 })],
        error: null,
      }),
    });

    await pullFromCloud();

    const saved = await localDb.records.get("r-cond");
    expect(saved?.id).toBe("r-cond");
    expect(saved).not.toHaveProperty("conditionScale");
  });

  it("Postgres の time 列が HH:MM:SS で返っても HH:MM へ正規化する(#61)", async () => {
    mockRecordsTable({
      select: vi.fn().mockResolvedValue({
        data: [makeCloudRow({ id: "r-time", wake_time: "06:45:00", depart_time: "07:30:00" })],
        error: null,
      }),
    });

    await pullFromCloud();

    const saved = await localDb.records.get("r-time");
    expect(saved?.wakeTime).toBe("06:45");
    expect(saved?.departTime).toBe("07:30");
  });

  it("既に HH:MM で返る場合はそのまま保つ(#61)", async () => {
    mockRecordsTable({
      select: vi.fn().mockResolvedValue({
        data: [makeCloudRow({ id: "r-short", wake_time: "06:45", depart_time: null })],
        error: null,
      }),
    });

    await pullFromCloud();

    const saved = await localDb.records.get("r-short");
    expect(saved?.wakeTime).toBe("06:45");
    expect(saved?.departTime).toBeNull();
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

  it("クラウドのchild_idをローカルのchildIdとして取り込む(複数の子ども対応 #3)", async () => {
    mockRecordsTable({
      select: vi.fn().mockResolvedValue({
        data: [makeCloudRow({ id: "cloud-1", child_id: "child-1" })],
        error: null,
      }),
    });

    await pullFromCloud();

    expect((await localDb.records.get("cloud-1"))?.childId).toBe("child-1");
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

  it("行数上限を超えるクラウド記録も全ページ取得し、取得漏れを「見えなくなった」と誤判定して削除しない(#55)", async () => {
    // PULL_PAGE_SIZE(500)を超える 1201 件。最後のページにしか含まれない記録がローカルに
    // synced で存在していても、ページングが正しければ削除されない。
    const total = PULL_PAGE_SIZE * 2 + 201;
    const all = Array.from({ length: total }, (_, i) =>
      makeCloudRow({ id: `cloud-${String(i).padStart(5, "0")}`, record_date: "2026-01-01" })
    );
    const lastId = all[total - 1]?.id ?? "";
    await localDb.records.add(makeLocalRecord({ id: lastId, syncStatus: "synced" }));
    const select = vi.fn((from: number, to: number) =>
      Promise.resolve({ data: all.slice(from, to + 1), error: null })
    );
    mockRecordsTable({ select });

    await pullFromCloud();

    expect(select).toHaveBeenCalledTimes(3);
    expect(select).toHaveBeenNthCalledWith(1, 0, PULL_PAGE_SIZE - 1);
    expect(select).toHaveBeenNthCalledWith(3, PULL_PAGE_SIZE * 2, PULL_PAGE_SIZE * 3 - 1);
    expect(await localDb.records.count()).toBe(total);
    expect(await localDb.records.get(lastId)).toBeDefined();
    expect(reportSyncOutcome).toHaveBeenCalledWith(true);
  });

  it("2ページ目以降の取得に失敗した場合、部分的な結果でローカルの同期済み記録を削除しない", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await localDb.records.add(makeLocalRecord({ id: "keep-me", syncStatus: "synced" }));
    const firstPage = Array.from({ length: PULL_PAGE_SIZE }, (_, i) =>
      makeCloudRow({ id: `cloud-${String(i).padStart(5, "0")}` })
    );
    const select = vi.fn((from: number) =>
      from === 0
        ? Promise.resolve({ data: firstPage, error: null })
        : Promise.resolve({ data: null, error: new Error("page 2 failed") })
    );
    mockRecordsTable({ select });

    await pullFromCloud();

    expect(await localDb.records.get("keep-me")).toBeDefined();
    expect(reportSyncOutcome).toHaveBeenCalledWith(false);
    warnSpy.mockRestore();
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
