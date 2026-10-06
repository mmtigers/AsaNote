import { describe, expect, it, vi } from "vitest";
import { buildRecordRow, upsertRecord } from "./import-records.mjs";

const NOW = "2026-10-06T00:00:00.000Z";

describe("buildRecordRow", () => {
  it("最小の入力は未入力列を null/空配列にする", () => {
    const row = buildRecordRow({ recordDate: "2026-10-01" }, "u1", null, NOW);
    expect(row).toMatchObject({ user_id: "u1", child_id: null, record_date: "2026-10-01", outcome: null, t_bed: null, memo: null });
    expect(row.trigger_tags).toEqual([]);
    expect(row.updated_at).toBe(NOW);
  });

  it("times とタグを DB の列名へ対応づける", () => {
    const row = buildRecordRow(
      { recordDate: "2026-10-01", outcome: "storm", times: { hwStart: "16:00", bed: "21:15" }, trigger: ["宿題"], dinner: "no", responseEffect: "bad" },
      "u1",
      "c1",
      NOW
    );
    expect(row).toMatchObject({ child_id: "c1", t_hw_start: "16:00", t_bed: "21:15", trigger_tags: ["宿題"], dinner: "no", response_effect: "bad" });
  });

  it.each([
    [{ recordDate: "10/01" }, "recordDate"],
    [{ recordDate: "2026-10-01", outcome: "angry" }, "outcome"],
    [{ recordDate: "2026-10-01", times: { bed: "25:00" } }, "times.bed"],
    [{ recordDate: "2026-10-01", times: { sleep: "21:00" } }, "未知のキー"],
    [{ recordDate: "2026-10-01", trigger: "宿題" }, "trigger"],
    [{ recordDate: "2026-10-01", memo: "あ".repeat(2001) }, "memo"],
  ])("不正な入力は例外にする %#", (input, message) => {
    expect(() => buildRecordRow(input, "u1", null, NOW)).toThrow(message);
  });
});

function fakeSupabase(existing) {
  const calls = { update: vi.fn(), insert: vi.fn() };
  const builder = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({ data: existing, error: null }),
  };
  return {
    calls,
    from: () => ({
      ...builder,
      update: (row) => ({ eq: async () => (calls.update(row), { error: null }) }),
      insert: async (row) => (calls.insert(row), { error: null }),
    }),
  };
}

describe("upsertRecord", () => {
  it("既存があれば更新、無ければ新規作成(べき等)", async () => {
    const existing = fakeSupabase({ id: "r1" });
    expect(await upsertRecord(existing, "u1", null, { recordDate: "2026-10-01" }, NOW)).toBe("updated");
    expect(existing.calls.update).toHaveBeenCalledOnce();

    const none = fakeSupabase(null);
    expect(await upsertRecord(none, "u1", null, { recordDate: "2026-10-01" }, NOW)).toBe("inserted");
    expect(none.calls.insert).toHaveBeenCalledWith(expect.objectContaining({ created_at: NOW, record_date: "2026-10-01" }));
  });
});
