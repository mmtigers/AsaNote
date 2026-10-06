import { afterEach, describe, expect, it } from "vitest";
import { createReleaseSeenStore } from "./releaseSeen";

afterEach(() => window.localStorage.clear());

describe("createReleaseSeenStore", () => {
  it("localStorage のキーは `${appId}:lastSeenReleaseVersion`", () => {
    createReleaseSeenStore("app-x").markVersionSeen("1.2.3");
    expect(window.localStorage.getItem("app-x:lastSeenReleaseVersion")).toBe("1.2.3");
  });

  it("変更を `${appId}:release-seen-changed` で通知する", () => {
    let count = 0;
    const onChange = () => count++;
    window.addEventListener("app-y:release-seen-changed", onChange);
    createReleaseSeenStore("app-y").markVersionSeen("0.1.0");
    window.removeEventListener("app-y:release-seen-changed", onChange);
    expect(count).toBe(1);
  });

  it("アプリが違えば値も別々に持つ", () => {
    createReleaseSeenStore("app-1").markVersionSeen("9.9.9");
    expect(window.localStorage.getItem("app-2:lastSeenReleaseVersion")).toBeNull();
  });
});
