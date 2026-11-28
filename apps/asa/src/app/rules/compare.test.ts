import { describe, expect, it } from "vitest";
import type { AggregatableRecord } from "@/app/stats/aggregate";
import { compareAroundRule } from "./compare";

function rec(recordDate: string, outcome: AggregatableRecord["outcome"], wakeTime: string | null = null): AggregatableRecord {
  return { recordDate, updatedAt: `${recordDate}T08:00:00Z`, outcome, wakeTime };
}

describe("compareAroundRule", () => {
  const records = [
    rec("2026-09-17", "reluctant", "07:20"), // 前(14日前の境界)
    rec("2026-09-25", "absent", "07:30"),
    rec("2026-09-30", "smooth"), // 前
    rec("2026-10-01", "smooth", "06:50"), // 開始日(後に含む)
    rec("2026-10-05", "reluctant", "06:45"),
    rec("2026-10-06", null, "06:40"), // 結果が未選択: 割合には数えず、起床の帯には数える
    rec("2026-09-16", "absent", "07:30"), // 前の範囲外
  ];

  it("開始日の前後14日で、件数・行き渋り率・起床の最頻の帯を出す", () => {
    const c = compareAroundRule(records, { startedOn: "2026-10-01", endedOn: null }, "2026-10-10");
    expect(c.before.total).toBe(3);
    expect(c.before.reluctant).toBe(2);
    expect(c.before.reluctantRate).toBe(67);
    expect(c.before.commonWake).toEqual({ label: "7時15分〜", count: 2 });
    expect(c.before.wakeCount).toBe(2);
    expect(c.after.total).toBe(2);
    expect(c.after.reluctantRate).toBe(50);
    expect(c.after.commonWake).toEqual({ label: "7時より前", count: 3 });
    expect(c.after.wakeCount).toBe(3);
    expect(c.hasAfter).toBe(true);
  });

  it("起床の帯が同数なら早い帯を出す", () => {
    const c = compareAroundRule(
      [rec("2026-10-01", "smooth", "07:20"), rec("2026-10-02", "smooth", "07:05")],
      { startedOn: "2026-10-01", endedOn: null },
      "2026-10-10"
    );
    expect(c.after.commonWake).toEqual({ label: "7時〜7時15分", count: 1 });
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

  it("記録が無い期間は割合0・起床の帯がnull", () => {
    const c = compareAroundRule([], { startedOn: "2026-10-01", endedOn: null }, "2026-10-10");
    expect(c.before.reluctantRate).toBe(0);
    expect(c.before.commonWake).toBeNull();
    expect(c.after.total).toBe(0);
  });
});
