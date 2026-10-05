import { describe, expect, it } from "vitest";
import { getHolidayName } from "./holidays";

describe("getHolidayName", () => {
  it("祝日なら名前を返す", () => {
    expect(getHolidayName("2026-01-01")).toBe("元日");
    expect(getHolidayName("2026-09-21")).toBe("敬老の日");
  });

  it("祝日でなければnullを返す", () => {
    expect(getHolidayName("2026-09-14")).toBeNull();
  });
});
