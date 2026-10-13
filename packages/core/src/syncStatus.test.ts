import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSyncStatus } from "./syncStatus";

const { dismissSyncFailureNotice, getLastSuccessAt, getSyncFailing, reportSyncOutcome } = createSyncStatus("test-app");

beforeEach(() => {
  // 各テストの前に、成功報告でカウンタとdismiss状態を確実にリセットする。
  reportSyncOutcome(true);
});

describe("syncStatus", () => {
  it("初期状態(成功のみ)では失敗扱いにならない", () => {
    expect(getSyncFailing()).toBe(false);
  });

  it("失敗が閾値未満の間は失敗扱いにならない", () => {
    reportSyncOutcome(false);
    reportSyncOutcome(false);
    expect(getSyncFailing()).toBe(false);
  });

  it("失敗が3回連続すると失敗扱いになる", () => {
    reportSyncOutcome(false);
    reportSyncOutcome(false);
    reportSyncOutcome(false);
    expect(getSyncFailing()).toBe(true);
  });

  it("途中で成功すると連続失敗カウントがリセットされる", () => {
    reportSyncOutcome(false);
    reportSyncOutcome(false);
    reportSyncOutcome(true);
    reportSyncOutcome(false);
    reportSyncOutcome(false);
    expect(getSyncFailing()).toBe(false);
  });

  it("失敗扱いになった後に成功すると失敗扱いが解除される", () => {
    reportSyncOutcome(false);
    reportSyncOutcome(false);
    reportSyncOutcome(false);
    expect(getSyncFailing()).toBe(true);

    reportSyncOutcome(true);
    expect(getSyncFailing()).toBe(false);
  });

  it("dismissSyncFailureNoticeで一旦非表示になり、新たな失敗が積み重なるまで再表示しない", () => {
    reportSyncOutcome(false);
    reportSyncOutcome(false);
    reportSyncOutcome(false);
    expect(getSyncFailing()).toBe(true);

    dismissSyncFailureNotice();
    expect(getSyncFailing()).toBe(false);

    reportSyncOutcome(false);
    expect(getSyncFailing()).toBe(true);
  });
});

describe("createSyncStatus", () => {
  it("アプリごとに状態が独立している", () => {
    const a = createSyncStatus("app-a");
    const b = createSyncStatus("app-b");
    for (let i = 0; i < 3; i++) a.reportSyncOutcome(false);
    expect(a.getSyncFailing()).toBe(true);
    expect(b.getSyncFailing()).toBe(false);
  });

  it("イベント名は `${appId}:sync-status-changed`", () => {
    const status = createSyncStatus("app-c");
    const listener = vi.fn();
    window.addEventListener("app-c:sync-status-changed", listener);
    for (let i = 0; i < 3; i++) status.reportSyncOutcome(false);
    window.removeEventListener("app-c:sync-status-changed", listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("最後に同期が成功した時刻を覚える。失敗では更新しない(#213)", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-13T00:00:00Z"));
      reportSyncOutcome(true);
      const at = getLastSuccessAt();
      expect(at).toBe(new Date("2026-10-13T00:00:00Z").getTime());

      vi.setSystemTime(new Date("2026-10-13T00:10:00Z"));
      reportSyncOutcome(false);
      expect(getLastSuccessAt()).toBe(at);
    } finally {
      vi.useRealTimers();
    }
  });
});
