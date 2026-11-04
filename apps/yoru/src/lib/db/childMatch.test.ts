import { describe, expect, it } from "vitest";
import { isForChildOrUnassigned, pickDayStatuses, pickLatestForChild } from "./childMatch";

describe("isForChildOrUnassigned", () => {
  it("選択中の子どもの記録と未分類の記録が対象", () => {
    expect(isForChildOrUnassigned("a", "a")).toBe(true);
    expect(isForChildOrUnassigned(null, "a")).toBe(true);
    expect(isForChildOrUnassigned(undefined, "a")).toBe(true);
    expect(isForChildOrUnassigned("b", "a")).toBe(false);
  });
  it("子どもが未選択なら未分類の記録だけ", () => {
    expect(isForChildOrUnassigned(null, null)).toBe(true);
    expect(isForChildOrUnassigned("a", null)).toBe(false);
  });
});

describe("pickDayStatuses", () => {
  const row = (recordDate: string, childId: string | null, outcome: string | null, updatedAt: string) => ({
    recordDate,
    childId,
    outcome,
    updatedAt,
  });
  it("未分類の記録(10月分)も、選択中の子どものカレンダーに出る", () => {
    const m = pickDayStatuses([row("2026-10-01", null, "calm", "1")], "a");
    expect(m.get("2026-10-01")).toBe("calm");
  });
  it("別の子どもの記録は出ない", () => {
    expect(pickDayStatuses([row("2026-10-01", "b", "calm", "1")], "a").size).toBe(0);
  });
  it("同じ日は、子どもの記録が未分類より優先される(更新が新しくても)", () => {
    const m = pickDayStatuses(
      [row("2026-10-01", "a", "rough", "1"), row("2026-10-01", null, "calm", "2")],
      "a"
    );
    expect(m.get("2026-10-01")).toBe("rough");
  });
});

describe("pickLatestForChild", () => {
  const r = (id: string, childId: string | null, updatedAt: string) => ({ id, childId, updatedAt });
  it("子どもの記録を優先し、無ければ未分類の記録を返す", () => {
    expect(pickLatestForChild([r("n", null, "2"), r("a", "a", "1")], "a")?.id).toBe("a");
    expect(pickLatestForChild([r("n", null, "2")], "a")?.id).toBe("n");
  });
  it("別の子どもの記録は対象外", () => {
    expect(pickLatestForChild([r("b", "b", "1")], "a")).toBeUndefined();
  });
  it("同じ区分なら更新が新しいもの", () => {
    expect(pickLatestForChild([r("old", "a", "1"), r("new", "a", "2")], "a")?.id).toBe("new");
  });
});
