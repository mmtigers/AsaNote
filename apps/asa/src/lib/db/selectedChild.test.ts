import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSelectedChildId, setSelectedChildId, useSelectedChildId } from "./selectedChild";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
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

  // ここから下は #62 のリファクタリング(定型の共通化)で壊さないための特性テスト。

  it("読めない環境(プライベートブラウジング等)ではnullにフォールバックする", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(getSelectedChildId()).toBeNull();
  });

  it("書けない環境でもthrowしない(選択操作自体は続行できる)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => setSelectedChildId("c1")).not.toThrow();
  });

  it("フックが同一タブ内の変更に追従する", () => {
    const { result } = renderHook(() => useSelectedChildId());
    expect(result.current).toBeNull();

    act(() => setSelectedChildId("c1"));

    // storageイベントは別タブにしか飛ばないため、自タブ用の通知が要る
    expect(result.current).toBe("c1");
  });

  it("フックがnull化にも追従する", () => {
    setSelectedChildId("c1");
    const { result } = renderHook(() => useSelectedChildId());
    expect(result.current).toBe("c1");

    act(() => setSelectedChildId(null));

    expect(result.current).toBeNull();
  });
});
