import { afterEach, describe, expect, it } from "vitest";
import { APP_ID } from "./appConfig";
import { markVersionSeen } from "./releaseSeen";

// 公開後は、ユーザーの端末にこれらのキー・イベント名で値が保存される。
// 変えると保存済みの値が読めなくなるため、名前を固定する(あさノート・よるノートと同じ方式)。
afterEach(() => window.localStorage.clear());

describe("localStorage のキーとイベント名(変更禁止)", () => {
  it("APP_ID", () => {
    expect(APP_ID).toBe("oya-note");
  });

  it("最後に見たリリース: キーとイベント名", () => {
    let notified = 0;
    const onChange = () => notified++;
    window.addEventListener("oya-note:release-seen-changed", onChange);
    markVersionSeen("1.2.3");
    window.removeEventListener("oya-note:release-seen-changed", onChange);

    expect(window.localStorage.getItem("oya-note:lastSeenReleaseVersion")).toBe("1.2.3");
    expect(notified).toBe(1);
  });
});
