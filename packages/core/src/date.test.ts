import { describe, expect, it } from "vitest";
import { WEEKDAYS, addDays, clampToToday, diffInDays, formatDateLabel, formatDateShort, isFutureDate, parseDateInputValue, parseTimeToMinutes, toDateInputValue, toMonthOf } from "./date";

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

describe("diffInDays", () => {
  it("toがfromより後ならプラスになる", () => {
    expect(diffInDays("2026-09-14", "2026-09-16")).toBe(2);
  });

  it("toがfromより前ならマイナスになる", () => {
    expect(diffInDays("2026-09-14", "2026-09-10")).toBe(-4);
  });

  it("同じ日なら0", () => {
    expect(diffInDays("2026-09-14", "2026-09-14")).toBe(0);
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

// #4(傾向タブの起床時刻集計)と出発時刻の区分判定が共有する。元は stats/aggregate.ts に
// あったが、出発時刻側でも必要になったためここへ寄せた。
describe("parseTimeToMinutes", () => {
  it("HH:MM を0時からの分数にする", () => {
    expect(parseTimeToMinutes("06:30")).toBe(390);
    expect(parseTimeToMinutes("6:30")).toBe(390);
    expect(parseTimeToMinutes("00:00")).toBe(0);
  });

  it("想定外の値はnullを返す", () => {
    expect(parseTimeToMinutes("")).toBeNull();
    expect(parseTimeToMinutes("6時30分")).toBeNull();
    expect(parseTimeToMinutes("25:00")).toBeNull();
    expect(parseTimeToMinutes("06:70")).toBeNull();
  });
});

describe("isFutureDate / clampToToday (#134)", () => {
  it("今日より後だけ未来日。今日と過去日は未来日ではない", () => {
    expect(isFutureDate("2026-10-10", "2026-10-09")).toBe(true);
    expect(isFutureDate("2026-10-09", "2026-10-09")).toBe(false);
    expect(isFutureDate("2026-10-08", "2026-10-09")).toBe(false);
  });

  it("月・年の境目でも前後を正しく比べる(ゼロ埋めの文字列比較)", () => {
    expect(isFutureDate("2027-01-01", "2026-12-31")).toBe(true);
    expect(isFutureDate("2026-12-31", "2027-01-01")).toBe(false);
    expect(isFutureDate("2026-10-01", "2026-09-30")).toBe(true);
  });

  it("今日はローカル日付で決まる。日付が変わる瞬間の前後で、その日の日付が今日になる", () => {
    const beforeMidnight = toDateInputValue(new Date(2026, 9, 9, 23, 59, 59));
    const afterMidnight = toDateInputValue(new Date(2026, 9, 10, 0, 0, 0));
    expect(beforeMidnight).toBe("2026-10-09");
    expect(isFutureDate("2026-10-10", beforeMidnight)).toBe(true);
    expect(isFutureDate("2026-10-10", afterMidnight)).toBe(false);
  });

  it("clampToToday: 未来日は今日に、過去日と今日はそのまま、読めない値は今日にする", () => {
    expect(clampToToday("2099-01-01", "2026-10-09")).toBe("2026-10-09");
    expect(clampToToday("2026-10-09", "2026-10-09")).toBe("2026-10-09");
    expect(clampToToday("2026-09-01", "2026-10-09")).toBe("2026-09-01");
    expect(clampToToday("abc", "2026-10-09")).toBe("2026-10-09");
    expect(clampToToday("2026-9-1", "2026-10-09")).toBe("2026-10-09");
  });
});
