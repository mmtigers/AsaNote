import { describe, expect, it } from "vitest";
import { shouldShowReminder } from "./RecordReminderNotice";

const today = "2026-10-06";
const at = (h: number) => new Date(2026, 9, 6, h, 0);

describe("shouldShowReminder", () => {
  it("20時より前は出さない", () => {
    expect(shouldShowReminder({ now: at(19), hasTodayRecord: false, dismissedDate: null, today })).toBe(false);
  });
  it("20時以降で未記録なら出す", () => {
    expect(shouldShowReminder({ now: at(20), hasTodayRecord: false, dismissedDate: null, today })).toBe(true);
  });
  it("記録済み・判定中は出さない", () => {
    expect(shouldShowReminder({ now: at(22), hasTodayRecord: true, dismissedDate: null, today })).toBe(false);
    expect(shouldShowReminder({ now: at(22), hasTodayRecord: undefined, dismissedDate: null, today })).toBe(false);
  });
  it("今日すでに閉じていれば出さず、翌日は出す", () => {
    expect(shouldShowReminder({ now: at(22), hasTodayRecord: false, dismissedDate: today, today })).toBe(false);
    expect(shouldShowReminder({ now: at(22), hasTodayRecord: false, dismissedDate: "2026-10-05", today })).toBe(true);
  });
});
