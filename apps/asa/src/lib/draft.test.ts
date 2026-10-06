import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DRAFT_STORAGE_KEY, notifyDraftChanged, useHasDraft } from "./draft";

/**
 * 下書きの有無は BottomNav のバッジに直結する。書き込み自体は
 * `src/app/_home/draftStorage.ts` が行い、このモジュールはキーの共有と購読だけを持つ。
 * #62 のリファクタリング(localStorage定型の共通化)で壊さないための特性テスト。
 */
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("useHasDraft", () => {
  it("下書きが無ければfalse", () => {
    const { result } = renderHook(() => useHasDraft());
    expect(result.current).toBe(false);
  });

  it("下書きを書いてnotifyDraftChangedを呼ぶとtrueになる", () => {
    const { result } = renderHook(() => useHasDraft());

    act(() => {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, "{}");
      notifyDraftChanged();
    });

    expect(result.current).toBe(true);
  });

  it("下書きを消してnotifyDraftChangedを呼ぶとfalseに戻る", () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, "{}");
    const { result } = renderHook(() => useHasDraft());
    expect(result.current).toBe(true);

    act(() => {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      notifyDraftChanged();
    });

    expect(result.current).toBe(false);
  });

  it("別タブでの変更(storageイベント)にも追従する", () => {
    const { result } = renderHook(() => useHasDraft());

    act(() => {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, "{}");
      window.dispatchEvent(new Event("storage"));
    });

    expect(result.current).toBe(true);
  });

  it("空文字の下書きでも「ある」と扱う(getItemがnullでないことだけを見る)", () => {
    const { result } = renderHook(() => useHasDraft());

    act(() => {
      window.localStorage.setItem(DRAFT_STORAGE_KEY, "");
      notifyDraftChanged();
    });

    expect(result.current).toBe(true);
  });

  it("読めない環境(プライベートブラウジング等)ではfalseにフォールバックする", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const { result } = renderHook(() => useHasDraft());

    expect(result.current).toBe(false);
  });
});
