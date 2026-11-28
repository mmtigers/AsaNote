import { describe, expect, it } from "vitest";
import { ageAt, fiscalYear, formatAge, roomName } from "./age";

describe("ageAt / formatAge", () => {
  it("誕生日の前日までは、まだ年齢が上がらない", () => {
    expect(ageAt("2021-08-20", "2026-08-19")).toEqual({ years: 4, months: 11 });
    expect(ageAt("2021-08-20", "2026-08-20")).toEqual({ years: 5, months: 0 });
  });

  it("「5歳3か月」の形にする", () => {
    expect(formatAge("2021-08-20", "2026-11-28")).toBe("5歳3か月");
  });

  it("誕生日が無い・生まれる前の日付は空文字", () => {
    expect(formatAge(null, "2026-11-28")).toBe("");
    expect(formatAge("2026-12-01", "2026-11-28")).toBe("");
  });
});

describe("fiscalYear", () => {
  it("4月から翌年3月までを1つの年度にする", () => {
    expect(fiscalYear("2026-04-01")).toBe(2026);
    expect(fiscalYear("2027-03-31")).toBe(2026);
  });
});

describe("roomName(日本の学年の決まり)", () => {
  it("4月2日生まれと4月1日生まれは、別の学年になる", () => {
    // 2019-04-02〜2020-04-01 生まれが、2026年度の1年生
    expect(roomName("2019-04-02", 2026)).toBe("1年生の部屋");
    expect(roomName("2020-04-01", 2026)).toBe("1年生の部屋");
    expect(roomName("2020-04-02", 2026)).toBe("年長の部屋");
  });

  it("0歳児〜2歳児、年少・年中・年長、1〜6年生", () => {
    expect(roomName("2025-06-01", 2026)).toBe("0歳児の部屋");
    expect(roomName("2023-06-01", 2026)).toBe("2歳児の部屋");
    expect(roomName("2022-06-01", 2026)).toBe("年少の部屋");
    expect(roomName("2021-08-20", 2026)).toBe("年中の部屋");
    expect(roomName("2014-06-01", 2026)).toBe("6年生の部屋");
  });

  it("誕生日が無い・中学生以降・生まれる前の年度は「〇〇年度の部屋」", () => {
    expect(roomName(null, 2026)).toBe("2026年度の部屋");
    expect(roomName("2013-06-01", 2026)).toBe("2026年度の部屋");
    expect(roomName("2027-06-01", 2026)).toBe("2026年度の部屋");
  });
});
