import { afterEach, describe, expect, it } from "vitest";
import { APP_ID } from "./appConfig";
import { setSelectedChildId } from "./db/selectedChild";
import { reportSyncOutcome } from "./db/syncStatus";
import { markVersionSeen } from "./releaseSeen";

// ユーザーの端末には、これらのキー・イベント名で値が保存済み(または購読済み)。
// 変えると保存済みの値が読めなくなるため、共通化(@note/core)後も同じ名前であることを固定する。
afterEach(() => window.localStorage.clear());

describe("localStorage のキーとイベント名(変更禁止)", () => {
  it("APP_ID", () => {
    expect(APP_ID).toBe("yoru-note");
  });

  it("選択中の子ども: キーとイベント名", () => {
    let notified = 0;
    const onChange = () => notified++;
    window.addEventListener("yoru-note:selected-child-changed", onChange);
    setSelectedChildId("c1");
    window.removeEventListener("yoru-note:selected-child-changed", onChange);

    expect(window.localStorage.getItem("yoru-note:selectedChildId")).toBe("c1");
    expect(notified).toBe(1);
  });

  it("最後に見たリリース: キーとイベント名", () => {
    let notified = 0;
    const onChange = () => notified++;
    window.addEventListener("yoru-note:release-seen-changed", onChange);
    markVersionSeen("1.2.3");
    window.removeEventListener("yoru-note:release-seen-changed", onChange);

    expect(window.localStorage.getItem("yoru-note:lastSeenReleaseVersion")).toBe("1.2.3");
    expect(notified).toBe(1);
  });

  it("同期失敗の通知: イベント名", () => {
    let notified = 0;
    const onChange = () => notified++;
    window.addEventListener("yoru-note:sync-status-changed", onChange);
    for (let i = 0; i < 3; i++) reportSyncOutcome(false);
    reportSyncOutcome(true); // 後続テストへ状態を残さない
    window.removeEventListener("yoru-note:sync-status-changed", onChange);

    expect(notified).toBeGreaterThanOrEqual(1);
  });
});
