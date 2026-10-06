import { describe, expect, it } from "vitest";
import { shouldShowReminder } from "./RecordReminderNotice";

const TODAY = "2026-09-15";
const MORNING = new Date("2026-09-15T09:00:00");
const AFTERNOON = new Date("2026-09-15T12:30:00");
const NOON_EXACT = new Date("2026-09-15T12:00:00");

describe("shouldShowReminder", () => {
  it("正午より前は表示しない", () => {
    expect(
      shouldShowReminder({ now: MORNING, hasTodayRecord: false, dismissedDate: null, today: TODAY })
    ).toBe(false);
  });

  it("正午ちょうどは表示する", () => {
    expect(
      shouldShowReminder({ now: NOON_EXACT, hasTodayRecord: false, dismissedDate: null, today: TODAY })
    ).toBe(true);
  });

  it("正午以降で今日の記録が無ければ表示する", () => {
    expect(
      shouldShowReminder({ now: AFTERNOON, hasTodayRecord: false, dismissedDate: null, today: TODAY })
    ).toBe(true);
  });

  it("今日の記録が既にあれば表示しない", () => {
    expect(
      shouldShowReminder({ now: AFTERNOON, hasTodayRecord: true, dismissedDate: null, today: TODAY })
    ).toBe(false);
  });

  it("記録の有無がまだ取得できていない(undefined)間は表示しない", () => {
    expect(
      shouldShowReminder({ now: AFTERNOON, hasTodayRecord: undefined, dismissedDate: null, today: TODAY })
    ).toBe(false);
  });

  it("今日すでに閉じていれば表示しない", () => {
    expect(
      shouldShowReminder({ now: AFTERNOON, hasTodayRecord: false, dismissedDate: TODAY, today: TODAY })
    ).toBe(false);
  });

  it("閉じたのが別の日であれば表示する", () => {
    expect(
      shouldShowReminder({ now: AFTERNOON, hasTodayRecord: false, dismissedDate: "2026-09-14", today: TODAY })
    ).toBe(true);
  });
});
