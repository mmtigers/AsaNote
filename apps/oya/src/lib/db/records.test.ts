import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, rpc, upsertChain } = vi.hoisted(() => {
  const upsertChain = { upsert: vi.fn(), select: vi.fn(), single: vi.fn() };
  return { from: vi.fn(), rpc: vi.fn(), upsertChain };
});
vi.mock("@/lib/supabase", () => ({ db: () => ({ from, rpc }) }));

import { completeOwnRecord, EMPTY_INPUT, fromRow, toRowValues, upsertOwnRecord } from "./records";

const row = {
  id: "r1",
  user_id: "u1",
  record_date: "2026-10-17",
  breakfast: "ate",
  lunch: null,
  dinner: "none",
  medication: "unsure",
  went_out: false,
  shopping: null,
  hospital: true,
  condition: "good",
  memo: "メモ",
  completed_at: null,
  updated_at: "2026-10-17T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  upsertChain.upsert.mockReturnValue(upsertChain);
  upsertChain.select.mockReturnValue(upsertChain);
  upsertChain.single.mockResolvedValue({ data: row, error: null });
  from.mockReturnValue(upsertChain);
});

describe("toRowValues", () => {
  it("未入力は null のまま送る(「しなかった」の false と区別する)", () => {
    expect(toRowValues({ ...EMPTY_INPUT, wentOut: false })).toMatchObject({ went_out: false, shopping: null, breakfast: null });
  });

  it("メモは前後の空白を除き、空なら null", () => {
    expect(toRowValues({ ...EMPTY_INPUT, memo: "  " }).memo).toBeNull();
    expect(toRowValues({ ...EMPTY_INPUT, memo: " 散歩 " }).memo).toBe("散歩");
  });
});

describe("fromRow", () => {
  it("行を画面で使う形にする(未入力は null、メモは空文字)", () => {
    expect(fromRow({ ...row, memo: null })).toMatchObject({
      breakfast: "ate",
      lunch: null,
      dinner: "none",
      medication: "unsure",
      wentOut: false,
      shopping: null,
      hospital: true,
      condition: "good",
      memo: "",
    });
  });

  it("想定外の値は未入力として扱う", () => {
    expect(fromRow({ ...row, breakfast: "lots", condition: "?" })).toMatchObject({ breakfast: null, condition: null });
  });
});

describe("upsertOwnRecord", () => {
  it("(user_id, record_date) で upsert する(同じ日は上書きになり、重複しない)", async () => {
    await upsertOwnRecord({ userId: "u1", familyId: "f1", recordDate: "2026-10-17", input: { ...EMPTY_INPUT, breakfast: "ate" } });
    expect(from).toHaveBeenCalledWith("oya_records");
    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1", record_date: "2026-10-17", breakfast: "ate", lunch: null }),
      { onConflict: "user_id,record_date" }
    );
  });

  it("サーバーが保存した行を返す", async () => {
    const saved = await upsertOwnRecord({ userId: "u1", familyId: "f1", recordDate: "2026-10-17", input: EMPTY_INPUT });
    expect(saved).toMatchObject({ id: "r1", recordDate: "2026-10-17", breakfast: "ate" });
  });

  it("サーバーのエラーは、そのまま投げる", async () => {
    upsertChain.single.mockResolvedValue({ data: null, error: { message: "future_date" } });
    await expect(upsertOwnRecord({ userId: "u1", familyId: "f1", recordDate: "2026-10-17", input: EMPTY_INPUT })).rejects.toEqual({
      message: "future_date",
    });
  });
});

describe("completeOwnRecord", () => {
  it("写真があれば、写真を返す", async () => {
    rpc.mockResolvedValue({ data: [{ photo_id: "p1", storage_path: "f/p1.jpg", completed_at: "t" }], error: null });
    await expect(completeOwnRecord("2026-10-17")).resolves.toEqual({ completedAt: "t", photo: { photoId: "p1", storagePath: "f/p1.jpg" } });
    expect(rpc).toHaveBeenCalledWith("complete_oya_record", { p_record_date: "2026-10-17" });
  });

  it("写真が無い日は photo: null(完了はしている)", async () => {
    rpc.mockResolvedValue({ data: [{ photo_id: null, storage_path: null, completed_at: "t" }], error: null });
    await expect(completeOwnRecord("2026-10-17")).resolves.toEqual({ completedAt: "t", photo: null });
  });
});

describe("fetchRecordsInRange", () => {
  it("ある親の期間内の記録を、新しい順に読む", async () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const name of ["select", "eq", "gte", "lte"]) chain[name] = vi.fn(() => chain);
    chain.order = vi.fn().mockResolvedValue({ data: [row], error: null });
    from.mockReturnValue(chain);
    const { fetchRecordsInRange } = await import("./records");
    await expect(fetchRecordsInRange("u1", "2026-10-11", "2026-10-17")).resolves.toEqual([fromRow(row)]);
    expect(chain.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(chain.gte).toHaveBeenCalledWith("record_date", "2026-10-11");
    expect(chain.lte).toHaveBeenCalledWith("record_date", "2026-10-17");
    expect(chain.order).toHaveBeenCalledWith("record_date", { ascending: false });
  });
});
