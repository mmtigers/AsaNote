import { describe, expect, it } from "vitest";
import { datesBetween, datesToShow, dayState, periodOf, summarize } from "./recordStats";

describe("dayState", () => {
  it("記録が無ければ未記録、完了していなければ途中まで、完了なら完了", () => {
    expect(dayState(undefined)).toBe("none");
    expect(dayState({ completedAt: null })).toBe("partial");
    expect(dayState({ completedAt: "t" })).toBe("completed");
  });
});

describe("periodOf", () => {
  it("週: 今日までの7日間を0として、7日ずつさかのぼる", () => {
    expect(periodOf("week", 0, "2026-10-18")).toMatchObject({ from: "2026-10-12", to: "2026-10-18", label: "この1週間" });
    expect(periodOf("week", 1, "2026-10-18")).toMatchObject({ from: "2026-10-05", to: "2026-10-11", label: "10/5〜10/11" });
  });

  it("月: 暦の月。今月は今日まで(未来の日は数えない)", () => {
    expect(periodOf("month", 0, "2026-10-18")).toMatchObject({ from: "2026-10-01", to: "2026-10-18", label: "今月(2026年10月)" });
    expect(periodOf("month", 1, "2026-10-18")).toMatchObject({ from: "2026-09-01", to: "2026-09-30", label: "2026年9月" });
  });

  it("月: 年をまたぐ・うるう年の2月", () => {
    expect(periodOf("month", 10, "2026-10-18")).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
    expect(periodOf("month", 1, "2028-03-05")).toMatchObject({ from: "2028-02-01", to: "2028-02-29" });
  });
});

describe("datesBetween / datesToShow", () => {
  it("新しい順に、両端を含む", () => {
    expect(datesBetween("2026-09-29", "2026-10-02")).toEqual(["2026-10-02", "2026-10-01", "2026-09-30", "2026-09-29"]);
  });

  it("参加した日より前の日は、記録が無ければ除く", () => {
    const recorded = new Set(["2026-10-10"]);
    expect(datesToShow("2026-10-09", "2026-10-13", recorded, "2026-10-12")).toEqual(["2026-10-13", "2026-10-12", "2026-10-10"]);
    expect(datesToShow("2026-10-09", "2026-10-10", new Set(), undefined)).toEqual(["2026-10-10", "2026-10-09"]);
  });
});

describe("summarize", () => {
  it("完了・途中まで・未記録・お薬を飲んでいない日を数える", () => {
    const records = new Map([
      ["2026-10-18", { completedAt: "t", medication: "taken" }],
      ["2026-10-17", { completedAt: "t", medication: "not_taken" }],
      ["2026-10-16", { completedAt: null, medication: "not_taken" }],
      ["2026-10-15", { completedAt: null, medication: "unsure" }],
      ["2026-10-14", { completedAt: "t", medication: null }],
    ]);
    const dates = datesBetween("2026-10-12", "2026-10-18");
    expect(summarize(dates, records)).toEqual({ completed: 3, partial: 2, none: 2, medicationNotTaken: 2 });
  });

  it("未記録の日は、お薬を飲んでいない日に数えない", () => {
    expect(summarize(["2026-10-18", "2026-10-17"], new Map())).toEqual({ completed: 0, partial: 0, none: 2, medicationNotTaken: 0 });
  });
});
