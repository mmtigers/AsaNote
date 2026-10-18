import { describe, expect, it } from "vitest";
import { addDaysToDate, isFutureJst, isValidDateString, todayJst } from "./jst";

describe("todayJst", () => {
  it("UTC の 15:00 は、日本時間では翌日の 0:00(日付が変わる)", () => {
    expect(todayJst(new Date("2026-10-17T14:59:59Z"))).toBe("2026-10-17");
    expect(todayJst(new Date("2026-10-17T15:00:00Z"))).toBe("2026-10-18");
  });

  it("月・年をまたぐ", () => {
    expect(todayJst(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
  });
});

describe("isFutureJst", () => {
  const now = new Date("2026-10-17T15:30:00Z"); // 日本時間 10/18 0:30
  it("日本時間の今日・過去は未来ではない", () => {
    expect(isFutureJst("2026-10-18", now)).toBe(false);
    expect(isFutureJst("2025-01-01", now)).toBe(false);
  });
  it("日本時間の明日は未来", () => {
    expect(isFutureJst("2026-10-19", now)).toBe(true);
  });
});

describe("isValidDateString", () => {
  it("実在する日付だけを受け付ける", () => {
    expect(isValidDateString("2026-02-28")).toBe(true);
    expect(isValidDateString("2028-02-29")).toBe(true);
    expect(isValidDateString("2026-02-29")).toBe(false);
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("2026-1-1")).toBe(false);
    expect(isValidDateString("")).toBe(false);
  });
});

describe("addDaysToDate", () => {
  it("月・年・うるう年をまたぐ", () => {
    expect(addDaysToDate("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToDate("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDaysToDate("2028-02-28", 1)).toBe("2028-02-29");
  });
});
