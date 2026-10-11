import { describe, expect, it } from "vitest";
import type { AggregatableRecord } from "@/app/stats/aggregate";
import { compareAroundRule } from "./compare";

function rec(recordDate: string, outcome: AggregatableRecord["outcome"], bed?: string): AggregatableRecord {
  return {
    recordDate,
    updatedAt: `${recordDate}T20:00:00Z`,
    outcome,
    times: bed ? { bed } : {},
    friend: [],
    trigger: [],
    response: [],
    responseEffect: null,
  };
}

describe("compareAroundRule", () => {
  const records = [
    rec("2026-09-17", "rough", "22:00"), // 前(14日前の境界)
    rec("2026-09-25", "storm", "22:30"),
    rec("2026-09-30", "calm"), // 前
    rec("2026-10-01", "calm", "21:00"), // 開始日(後に含む)
    rec("2026-10-05", "rough", "21:30"),
    rec("2026-09-16", "storm"), // 前の範囲外
  ];

  it("開始日の前後14日で件数・荒れ率・消灯の最頻の帯を出す", () => {
    const c = compareAroundRule(records, { startedOn: "2026-10-01", endedOn: null }, "2026-10-10");
    expect(c.before.total).toBe(3);
    expect(c.before.roughRate).toBe(67);
    expect(c.before.commonBed).toEqual({ label: "21時以降", count: 2 });
    expect(c.before.bedCount).toBe(2);
    expect(c.after.total).toBe(2);
    expect(c.after.roughRate).toBe(50);
    expect(c.after.commonBed).toEqual({ label: "21時以降", count: 2 });
    expect(c.hasAfter).toBe(true);
  });

  it("終了日があれば後の期間はそこまで", () => {
    const c = compareAroundRule(records, { startedOn: "2026-10-01", endedOn: "2026-10-03" }, "2026-10-10");
    expect(c.after.total).toBe(1);
    expect(c.after.to).toBe("2026-10-03");
  });

  it("開始日が未来なら後の期間は空", () => {
    const c = compareAroundRule(records, { startedOn: "2026-10-20", endedOn: null }, "2026-10-10");
    expect(c.hasAfter).toBe(false);
    expect(c.after.total).toBe(0);
  });

  it("記録が無い期間は消灯の帯がnull", () => {
    const c = compareAroundRule([], { startedOn: "2026-10-01", endedOn: null }, "2026-10-10");
    expect(c.before.commonBed).toBeNull();
    expect(c.after.total).toBe(0);
  });
});
