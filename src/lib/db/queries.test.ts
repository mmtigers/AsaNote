// @vitest-environment jsdom
/**
 * Issue #60: `queries.ts` はカバレッジ 4.3% だった。
 *
 * カレンダーのハイライト・リマインダーの出し分け・未同期バッジという、
 * 「間違っていても画面はエラーにならず、ただ表示が静かにおかしくなる」
 * 種類のロジックが集まっている。`useLiveQuery` を実際に動かして固定する。
 *
 * 所有判定(`isOwnRecord`)そのものは `ownership.test.ts` の担当で、ここでは
 * 「その判定を通したうえで、どう畳んで返すか」を見る。
 */
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearLocalData, localDb } from "./localDb";
import {
  useHasTodayOwnRecord,
  useHasTodayPartnerRecord,
  usePendingSyncCount,
  useRecordStatusForMonth,
  useRecordsTimeline,
} from "./queries";
import type { Outcome } from "@/constants/choices";

interface Seed {
  id: string;
  recordDate: string;
  updatedAt: string;
  userId?: string | null;
  childId?: string | null;
  outcome?: Outcome | null;
  syncStatus?: "pending" | "synced";
}

/** テスト用の最小の記録行。`queries.ts` が見るフィールドだけを埋める。 */
async function seed(rows: Seed[]) {
  await localDb.records.bulkPut(
    rows.map((r) => ({
      id: r.id,
      recordDate: r.recordDate,
      updatedAt: r.updatedAt,
      createdAt: r.updatedAt,
      userId: r.userId ?? null,
      childId: r.childId ?? null,
      outcome: r.outcome ?? null,
      syncStatus: r.syncStatus ?? "synced",
      wakeTime: null,
      wakeTags: [],
      triggerTags: [],
      reasonTags: [],
      responseTags: [],
      departTime: null,
      companion: null,
      handoff: null,
      memo: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any
  );
}

beforeEach(async () => {
  await clearLocalData();
});

afterEach(() => {
  cleanup();
});

describe("useRecordsTimeline", () => {
  it("日付の新しい順に並べる", async () => {
    await seed([
      { id: "a", recordDate: "2026-09-10", updatedAt: "2026-09-10T00:00:00Z" },
      { id: "c", recordDate: "2026-09-14", updatedAt: "2026-09-14T00:00:00Z" },
      { id: "b", recordDate: "2026-09-12", updatedAt: "2026-09-12T00:00:00Z" },
    ]);

    const { result } = renderHook(() => useRecordsTimeline());

    await waitFor(() => expect(result.current).toHaveLength(3));
    expect(result.current?.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("同じ日付なら更新の新しい順に並べる", async () => {
    await seed([
      { id: "old", recordDate: "2026-09-14", updatedAt: "2026-09-14T01:00:00Z" },
      { id: "new", recordDate: "2026-09-14", updatedAt: "2026-09-14T09:00:00Z" },
    ]);

    const { result } = renderHook(() => useRecordsTimeline());

    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current?.map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("パートナーの記録も含める(タイムラインは共有ビュー)", async () => {
    await seed([
      { id: "mine", recordDate: "2026-09-14", updatedAt: "2026-09-14T00:00:00Z", userId: "me" },
      { id: "theirs", recordDate: "2026-09-13", updatedAt: "2026-09-13T00:00:00Z", userId: "partner" },
    ]);

    const { result } = renderHook(() => useRecordsTimeline());

    await waitFor(() => expect(result.current).toHaveLength(2));
  });
});

describe("useRecordStatusForMonth", () => {
  it("指定した月だけを日付→outcomeのMapにして返す", async () => {
    await seed([
      { id: "in1", recordDate: "2026-09-03", updatedAt: "2026-09-03T00:00:00Z", userId: "me", outcome: "smooth" },
      { id: "in2", recordDate: "2026-09-20", updatedAt: "2026-09-20T00:00:00Z", userId: "me", outcome: "absent" },
      { id: "out", recordDate: "2026-10-01", updatedAt: "2026-10-01T00:00:00Z", userId: "me", outcome: "smooth" },
    ]);

    const { result } = renderHook(() => useRecordStatusForMonth("2026-09"));

    await waitFor(() => expect(result.current?.size).toBe(2));
    expect(result.current?.get("2026-09-03")).toBe("smooth");
    expect(result.current?.get("2026-09-20")).toBe("absent");
    expect(result.current?.has("2026-10-01")).toBe(false);
  });

  it("同じ日に複数あれば更新の新しい方を採る", async () => {
    await seed([
      { id: "first", recordDate: "2026-09-14", updatedAt: "2026-09-14T01:00:00Z", userId: "me", outcome: "smooth" },
      { id: "later", recordDate: "2026-09-14", updatedAt: "2026-09-14T09:00:00Z", userId: "me", outcome: "reluctant" },
    ]);

    const { result } = renderHook(() => useRecordStatusForMonth("2026-09"));

    await waitFor(() => expect(result.current?.size).toBe(1));
    expect(result.current?.get("2026-09-14")).toBe("reluctant");
  });

  it("パートナーの記録も含める(#1-2: 記録ページのカレンダーも傾向タブと揃える)", async () => {
    await seed([
      { id: "mine", recordDate: "2026-09-14", updatedAt: "2026-09-14T00:00:00Z", userId: "me", outcome: "smooth" },
      { id: "theirs", recordDate: "2026-09-15", updatedAt: "2026-09-15T00:00:00Z", userId: "partner", outcome: "smooth" },
    ]);

    const { result } = renderHook(() => useRecordStatusForMonth("2026-09"));

    await waitFor(() => expect(result.current?.size).toBe(2));
    expect(result.current?.has("2026-09-15")).toBe(true);
  });

  it("childIdが違う記録は除く(#3: 子どもごとの切り替え)", async () => {
    await seed([
      { id: "c1", recordDate: "2026-09-14", updatedAt: "2026-09-14T00:00:00Z", userId: "me", childId: "child-1", outcome: "smooth" },
      { id: "c2", recordDate: "2026-09-15", updatedAt: "2026-09-15T00:00:00Z", userId: "me", childId: "child-2", outcome: "smooth" },
    ]);

    const { result } = renderHook(() => useRecordStatusForMonth("2026-09", "child-1"));

    await waitFor(() => expect(result.current?.size).toBe(1));
    expect(result.current?.has("2026-09-14")).toBe(true);
  });

  it("childId未指定はchildIdを持たない記録だけを見る", async () => {
    await seed([
      { id: "none", recordDate: "2026-09-14", updatedAt: "2026-09-14T00:00:00Z", userId: "me", outcome: "smooth" },
      { id: "c1", recordDate: "2026-09-15", updatedAt: "2026-09-15T00:00:00Z", userId: "me", childId: "child-1", outcome: "smooth" },
    ]);

    const { result } = renderHook(() => useRecordStatusForMonth("2026-09"));

    await waitFor(() => expect(result.current?.size).toBe(1));
    expect(result.current?.has("2026-09-14")).toBe(true);
  });

  it("outcome未入力の日はnullとして載せる(「記録はあるが結果は未入力」)", async () => {
    await seed([
      { id: "r", recordDate: "2026-09-14", updatedAt: "2026-09-14T00:00:00Z", userId: "me", outcome: null },
    ]);

    const { result } = renderHook(() => useRecordStatusForMonth("2026-09"));

    await waitFor(() => expect(result.current?.size).toBe(1));
    expect(result.current?.get("2026-09-14")).toBeNull();
  });
});

describe("usePendingSyncCount", () => {
  it("pendingの件数だけを数える", async () => {
    await seed([
      { id: "p1", recordDate: "2026-09-14", updatedAt: "2026-09-14T00:00:00Z", syncStatus: "pending" },
      { id: "p2", recordDate: "2026-09-15", updatedAt: "2026-09-15T00:00:00Z", syncStatus: "pending" },
      { id: "s1", recordDate: "2026-09-16", updatedAt: "2026-09-16T00:00:00Z", syncStatus: "synced" },
    ]);

    const { result } = renderHook(() => usePendingSyncCount());

    await waitFor(() => expect(result.current).toBe(2));
  });

  it("未同期が無ければ0", async () => {
    await seed([
      { id: "s1", recordDate: "2026-09-14", updatedAt: "2026-09-14T00:00:00Z", syncStatus: "synced" },
    ]);

    const { result } = renderHook(() => usePendingSyncCount());

    await waitFor(() => expect(result.current).toBe(0));
  });
});

describe("useHasTodayOwnRecord", () => {
  it("その日に自分のoutcome入り記録があればtrue", async () => {
    await seed([
      { id: "r", recordDate: "2026-09-14", updatedAt: "2026-09-14T00:00:00Z", userId: "me", outcome: "smooth" },
    ]);

    const { result } = renderHook(() => useHasTodayOwnRecord("2026-09-14", "me"));

    await waitFor(() => expect(result.current).toBe(true));
  });

  it("outcome未入力ならfalse(リマインダーを出す)", async () => {
    await seed([
      { id: "r", recordDate: "2026-09-14", updatedAt: "2026-09-14T00:00:00Z", userId: "me", outcome: null },
    ]);

    const { result } = renderHook(() => useHasTodayOwnRecord("2026-09-14", "me"));

    await waitFor(() => expect(result.current).toBe(false));
  });

  it("パートナーの記録ではリマインダーを止めない", async () => {
    await seed([
      { id: "r", recordDate: "2026-09-14", updatedAt: "2026-09-14T00:00:00Z", userId: "partner", outcome: "smooth" },
    ]);

    const { result } = renderHook(() => useHasTodayOwnRecord("2026-09-14", "me"));

    await waitFor(() => expect(result.current).toBe(false));
  });

  it("子どもの内訳は見ない(その日に1件でもあればtrue)", async () => {
    await seed([
      { id: "r", recordDate: "2026-09-14", updatedAt: "2026-09-14T00:00:00Z", userId: "me", childId: "child-2", outcome: "smooth" },
    ]);

    const { result } = renderHook(() => useHasTodayOwnRecord("2026-09-14", "me"));

    await waitFor(() => expect(result.current).toBe(true));
  });

  it("別の日の記録では止めない", async () => {
    await seed([
      { id: "r", recordDate: "2026-09-13", updatedAt: "2026-09-13T00:00:00Z", userId: "me", outcome: "smooth" },
    ]);

    const { result } = renderHook(() => useHasTodayOwnRecord("2026-09-14", "me"));

    await waitFor(() => expect(result.current).toBe(false));
  });
});

describe("useHasTodayPartnerRecord", () => {
  it("パートナーの当日のoutcome入り記録があればtrue", async () => {
    await seed([
      { id: "r", recordDate: "2026-09-14", updatedAt: "2026-09-14T00:00:00Z", userId: "partner", outcome: "smooth" },
    ]);

    const { result } = renderHook(() => useHasTodayPartnerRecord("2026-09-14", "me"));

    await waitFor(() => expect(result.current).toBe(true));
  });

  it("自分の記録では完了扱いにしない", async () => {
    await seed([
      { id: "r", recordDate: "2026-09-14", updatedAt: "2026-09-14T00:00:00Z", userId: "me", outcome: "smooth" },
    ]);

    const { result } = renderHook(() => useHasTodayPartnerRecord("2026-09-14", "me"));

    await waitFor(() => expect(result.current).toBe(false));
  });

  it("パートナーの記録でもoutcome未入力ならfalse", async () => {
    await seed([
      { id: "r", recordDate: "2026-09-14", updatedAt: "2026-09-14T00:00:00Z", userId: "partner", outcome: null },
    ]);

    const { result } = renderHook(() => useHasTodayPartnerRecord("2026-09-14", "me"));

    await waitFor(() => expect(result.current).toBe(false));
  });

  it("childIdが違うパートナーの記録は対象外", async () => {
    await seed([
      {
        id: "r",
        recordDate: "2026-09-14",
        updatedAt: "2026-09-14T00:00:00Z",
        userId: "partner",
        childId: "child-2",
        outcome: "smooth",
      },
    ]);

    const { result } = renderHook(() => useHasTodayPartnerRecord("2026-09-14", "me", "child-1"));

    await waitFor(() => expect(result.current).toBe(false));
  });
});
