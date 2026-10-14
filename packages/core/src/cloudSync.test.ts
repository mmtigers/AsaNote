import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { reportClientError, fromMock, getSession } = vi.hoisted(() => ({
  reportClientError: vi.fn(),
  fromMock: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("./clientErrors", () => ({ reportClientError }));
vi.mock("./supabase/client", () => ({ getSupabaseClient: () => ({ from: fromMock, auth: { getSession } }) }));

import { createCloudResumePuller, createSyncFailureReporter, createSyncListenersRegistrar, fetchAllPages, PULL_PAGE_SIZE } from "./cloudSync";

afterEach(() => vi.clearAllMocks());

// select().order().order().range() のチェーン。range の呼び出しごとに、用意したページ(またはエラー)を返す。
function pagedTable(results: { data?: unknown[]; error?: unknown }[]) {
  const ranges: [number, number][] = [];
  const orders: string[] = [];
  const builder = {
    select: vi.fn(() => builder),
    order: vi.fn((column: string) => {
      orders.push(column);
      return builder;
    }),
    range: vi.fn((from: number, to: number) => {
      ranges.push([from, to]);
      return Promise.resolve(results[ranges.length - 1] ?? { data: [], error: null });
    }),
  };
  fromMock.mockReturnValue(builder);
  return { ranges, orders };
}

const rows = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => ({ id: String(offset + i) }));

describe("fetchAllPages", () => {
  it("1ページに収まれば、1回で終わる。orderBy → id の順で並べる", async () => {
    const { ranges, orders } = pagedTable([{ data: rows(3) }]);

    const result = await fetchAllPages("records", "record_date", vi.fn());

    expect(result).toHaveLength(3);
    expect(ranges).toEqual([[0, PULL_PAGE_SIZE - 1]]);
    expect(orders).toEqual(["record_date", "id"]);
    expect(fromMock).toHaveBeenCalledWith("records");
  });

  it("ちょうど1ページ分だと、空のページまで取りに行く(取り漏らさない)", async () => {
    const { ranges } = pagedTable([{ data: rows(PULL_PAGE_SIZE) }, { data: [] }]);

    const result = await fetchAllPages("records", "record_date", vi.fn());

    expect(result).toHaveLength(PULL_PAGE_SIZE);
    expect(ranges).toEqual([
      [0, PULL_PAGE_SIZE - 1],
      [PULL_PAGE_SIZE, PULL_PAGE_SIZE * 2 - 1],
    ]);
  });

  it("複数ページを順につなげる", async () => {
    pagedTable([{ data: rows(PULL_PAGE_SIZE) }, { data: rows(2, PULL_PAGE_SIZE) }]);

    const result = await fetchAllPages("records", "record_date", vi.fn());

    expect(result).toHaveLength(PULL_PAGE_SIZE + 2);
  });

  it("途中のページが失敗したら、その場所(offset)を知らせて null を返す(部分的な結果は返さない)", async () => {
    const failure = new Error("boom");
    pagedTable([{ data: rows(PULL_PAGE_SIZE) }, { error: failure }]);
    const onError = vi.fn();

    const result = await fetchAllPages("records", "record_date", onError);

    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledWith(failure, PULL_PAGE_SIZE);
  });
});

describe("createSyncFailureReporter", () => {
  it("アプリ名・版・段階・件数つきで sync-failure を送る。件数が無ければ null", () => {
    const report = createSyncFailureReporter("yoru", "1.2.3");
    const failure = new Error("x");

    report("push-records-bulk", failure, 3);
    report("push-record", failure);

    expect(reportClientError).toHaveBeenNthCalledWith(1, "yoru", "sync-failure", failure, "1.2.3", { phase: "push-records-bulk", count: 3 });
    expect(reportClientError).toHaveBeenNthCalledWith(2, "yoru", "sync-failure", failure, "1.2.3", { phase: "push-record", count: null });
  });
});

describe("createCloudResumePuller", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("ログイン済み(ローカルのセッションがある)ときだけ取り込む", async () => {
    const pull = vi.fn().mockResolvedValue(undefined);
    const puller = createCloudResumePuller(pull);

    getSession.mockResolvedValue({ data: { session: null } });
    expect(await puller.pullIfStale()).toBe(false);
    expect(pull).not.toHaveBeenCalled();

    getSession.mockResolvedValue({ data: { session: { user: { id: "u" } } } });
    expect(await puller.pullIfStale()).toBe(true);
    expect(pull).toHaveBeenCalledTimes(1);
  });
});

describe("createSyncListenersRegistrar", () => {
  it("起動時に同期し、online で同期し、解除すると online を聞かなくなる", () => {
    const sync = vi.fn().mockResolvedValue(undefined);
    const stopResume = vi.fn();
    const register = createSyncListenersRegistrar(sync, { markPulled: vi.fn(), pullIfStale: vi.fn(), register: () => stopResume });

    const stop = register();
    expect(sync).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("online"));
    expect(sync).toHaveBeenCalledTimes(2);

    stop?.();
    expect(stopResume).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("online"));
    expect(sync).toHaveBeenCalledTimes(2);
  });
});
