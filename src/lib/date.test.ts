import { describe, expect, it } from "vitest";
import { WEEKDAYS, addDays, formatDateLabel, formatDateShort, parseDateInputValue, toDateInputValue, toMonthOf } from "./date";

describe("parseDateInputValue", () => {
  it("常にローカルタイムゾーンの0時として解釈する(UTC解釈による1日ズレを防ぐ)", () => {
    const d = parseDateInputValue("2026-09-14");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8); // 0-indexed
    expect(d.getDate()).toBe(14);
    expect(d.getHours()).toBe(0);
  });
});

describe("toDateInputValue", () => {
  it("Dateを YYYY-MM-DD 形式に変換する(0埋めあり)", () => {
    expect(toDateInputValue(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("formatDateLabel", () => {
  it("「M月D日(曜)」形式で返す", () => {
    expect(formatDateLabel("2026-09-14")).toBe("9月14日(月)");
  });
});

describe("formatDateShort", () => {
  it("「M/D(曜)」形式で返す", () => {
    expect(formatDateShort("2026-09-14")).toBe("9/14(月)");
  });
});

describe("toMonthOf", () => {
  it("年と月を取り出す", () => {
    expect(toMonthOf("2026-12-31")).toEqual({ year: 2026, month: 12 });
  });
});

describe("addDays", () => {
  it("日数を加算する", () => {
    expect(addDays("2026-09-14", 1)).toBe("2026-09-15");
  });

  it("負の日数で減算し、月をまたぐ場合も正しく繰り下がる", () => {
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("年をまたぐ加算も正しく繰り上がる", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("WEEKDAYS", () => {
  // #62: 以前は MonthCalendar.tsx にも同じ配列があり、片方だけ直すと
  // カレンダーの見出しと日付ラベルで曜日の表記が食い違う状態だった。
  it("Date#getDay() の戻り値(0=日)をそのまま添字に使える並びである", () => {
    // 2026-01-04 は日曜
    const sunday = new Date("2026-01-04T00:00:00");
    expect(WEEKDAYS[sunday.getDay()]).toBe("日");
    // 2026-01-10 は土曜
    const saturday = new Date("2026-01-10T00:00:00");
    expect(WEEKDAYS[saturday.getDay()]).toBe("土");
  });

  it("7要素すべてが揃っている", () => {
    expect(WEEKDAYS).toEqual(["日", "月", "火", "水", "木", "金", "土"]);
  });
});
