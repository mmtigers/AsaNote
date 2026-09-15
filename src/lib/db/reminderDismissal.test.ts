import { afterEach, describe, expect, it } from "vitest";
import { dismissReminderForToday, getDismissedDate } from "./reminderDismissal";

afterEach(() => {
  window.localStorage.clear();
});

describe("reminderDismissal", () => {
  it("初期状態ではnullを返す", () => {
    expect(getDismissedDate()).toBeNull();
  });

  it("dismissReminderForTodayで保存した日付を読み出せる", () => {
    dismissReminderForToday("2026-09-15");
    expect(getDismissedDate()).toBe("2026-09-15");
  });
});
