import { afterEach, describe, expect, it } from "vitest";
import { getSelectedChildId, setSelectedChildId } from "./selectedChild";

afterEach(() => {
  window.localStorage.clear();
});

describe("selectedChild", () => {
  it("初期状態ではnullを返す", () => {
    expect(getSelectedChildId()).toBeNull();
  });

  it("setSelectedChildIdで保存した値を読み出せる", () => {
    setSelectedChildId("c1");
    expect(getSelectedChildId()).toBe("c1");
  });

  it("nullを渡すと保存された値を消す", () => {
    setSelectedChildId("c1");
    setSelectedChildId(null);
    expect(getSelectedChildId()).toBeNull();
  });
});
