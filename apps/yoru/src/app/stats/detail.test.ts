import { describe, expect, it } from "vitest";
import { computeDetailStats, groupRecordsByPeriod } from "./detail";

function record(recordDate: string) {
  return { recordDate };
}

describe("groupRecordsByPeriod", () => {
  it("日別は日付ごとにまとめる", () => {
    const records = [record("2026-09-10"), record("2026-09-10"), record("2026-09-12")];
    const result = groupRecordsByPeriod(records, "day");
    expect(result).toEqual([
      { key: "2026-09-10", label: "9/10", count: 2 },
      { key: "2026-09-12", label: "9/12", count: 1 },
    ]);
  });

  it("週別は日曜始まりの週にまとめる", () => {
    // 2026-09-10(木)と2026-09-13(日)は別の週、2026-09-13と2026-09-15(火)は同じ週。
    const records = [record("2026-09-10"), record("2026-09-13"), record("2026-09-15")];
    const result = groupRecordsByPeriod(records, "week");
    expect(result).toEqual([
      { key: "2026-09-06", label: "9/6", count: 1 },
      { key: "2026-09-13", label: "9/13", count: 2 },
    ]);
  });

  it("月別はYYYY-MMにまとめ、年をまたいでも別扱いにする", () => {
    const records = [record("2026-09-01"), record("2026-09-30"), record("2025-09-15")];
    const result = groupRecordsByPeriod(records, "month");
    expect(result).toEqual([
      { key: "2025-09", label: "2025/9", count: 1 },
      { key: "2026-09", label: "2026/9", count: 2 },
    ]);
  });

  it("記録が無い期間の行は作らない", () => {
    expect(groupRecordsByPeriod([], "day")).toEqual([]);
  });
});

describe("computeDetailStats", () => {
  it("件数・最頻曜日・月平均件数を返す", () => {
    // 2026-09-10, 17は木曜。2026-09-13は日曜。
    const records = [record("2026-09-10"), record("2026-09-17"), record("2026-09-13")];
    const result = computeDetailStats(records);
    expect(result.total).toBe(3);
    expect(result.modeWeekdayLabel).toBe("木");
    expect(result.monthlyAverage).toBe(3); // 1か月に3件
  });

  it("記録が無ければ最頻曜日はnull・平均は0", () => {
    expect(computeDetailStats([])).toEqual({ total: 0, modeWeekdayLabel: null, monthlyAverage: 0 });
  });

  it("複数月にまたがれば月平均を按分する", () => {
    const records = [record("2026-08-01"), record("2026-09-01"), record("2026-09-02"), record("2026-09-03")];
    const result = computeDetailStats(records);
    expect(result.total).toBe(4);
    expect(result.monthlyAverage).toBe(2); // 2か月で4件 -> 平均2件
  });
});
