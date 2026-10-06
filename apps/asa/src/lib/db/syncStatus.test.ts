import { beforeEach, describe, expect, it } from "vitest";
import { dismissSyncFailureNotice, getSyncFailing, reportSyncOutcome } from "./syncStatus";

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
