import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFamilyViewState, saveFamilyViewState } from "./familyViewState";

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("familyViewState", () => {
  it("保存した親・期間を読み戻す", () => {
    saveFamilyViewState({ parentId: "p1", kind: "month", offset: 2 });
    expect(window.sessionStorage.getItem("oya-note:family-view")).not.toBeNull();
    expect(loadFamilyViewState()).toEqual({ parentId: "p1", kind: "month", offset: 2 });
  });

  it("無い・壊れている・読めないときは、既定(今週)", () => {
    expect(loadFamilyViewState()).toEqual({ parentId: null, kind: "week", offset: 0 });
    window.sessionStorage.setItem("oya-note:family-view", "{broken");
    expect(loadFamilyViewState()).toEqual({ parentId: null, kind: "week", offset: 0 });
    window.sessionStorage.setItem("oya-note:family-view", JSON.stringify({ parentId: 1, kind: "year", offset: -1 }));
    expect(loadFamilyViewState()).toEqual({ parentId: null, kind: "week", offset: 0 });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadFamilyViewState()).toEqual({ parentId: null, kind: "week", offset: 0 });
  });
});
