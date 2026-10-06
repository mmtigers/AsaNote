import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dismissReminderForToday, getDismissedDate, useDismissedDate } from "./reminderDismissal";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("reminderDismissal", () => {
  it("初期状態ではnullを返す", () => {
    expect(getDismissedDate()).toBeNull();
  });

  it("dismissReminderForTodayで保存した日付を読み出せる", () => {
    dismissReminderForToday("2026-09-15");
    expect(getDismissedDate()).toBe("2026-09-15");
  });

  // ここから下は #62 のリファクタリング(定型の共通化)で壊さないための特性テスト。

  it("読めない環境(プライベートブラウジング等)ではnullにフォールバックする", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(getDismissedDate()).toBeNull();
  });

  it("書けない環境でもthrowしない(閉じる操作自体は続行できる)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => dismissReminderForToday("2026-09-15")).not.toThrow();
  });

  it("フックが同一タブ内の変更に追従する", () => {
    const { result } = renderHook(() => useDismissedDate());
    expect(result.current).toBeNull();

    act(() => dismissReminderForToday("2026-09-15"));

    expect(result.current).toBe("2026-09-15");
  });

  it("selectedChildとはキーが独立している(片方を閉じても他方に影響しない)", () => {
    const { result } = renderHook(() => useDismissedDate());

    act(() => window.localStorage.setItem("asa-note:selectedChildId", "c1"));

    expect(result.current).toBeNull();
  });
});
