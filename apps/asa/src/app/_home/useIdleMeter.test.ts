import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIdleMeter } from "./useIdleMeter";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useIdleMeter", () => {
  it("activeでない間は、放置を測らない(0)", () => {
    const { result } = renderHook(() => useIdleMeter(false));
    vi.setSystemTime(10 * 60_000);
    expect(result.current()).toBe(0);
  });

  it("activeの間、操作がなければ、しきい値(60秒)を超えた分が放置になる", () => {
    const { result } = renderHook(() => useIdleMeter(true));
    vi.setSystemTime(5 * 60_000);
    expect(result.current()).toBe(240);
  });

  it("タップやキー入力があれば、その時点で間隔を区切る", () => {
    const { result } = renderHook(() => useIdleMeter(true));
    vi.setSystemTime(30_000);
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    vi.setSystemTime(30_000 + 50_000);
    act(() => {
      window.dispatchEvent(new Event("keydown"));
    });
    // どの間隔も60秒以内なので、放置は0
    vi.setSystemTime(30_000 + 50_000 + 40_000);
    expect(result.current()).toBe(0);
  });

  it("activeがfalseに戻ったら、計測をやめて0に戻る。もう一度activeになれば新しく測る", () => {
    const { result, rerender } = renderHook(({ active }) => useIdleMeter(active), { initialProps: { active: true } });
    vi.setSystemTime(5 * 60_000);
    expect(result.current()).toBe(240);
    rerender({ active: false });
    expect(result.current()).toBe(0);
    rerender({ active: true });
    expect(result.current()).toBe(0);
  });

  it("アンマウント後は、イベントを聞かない(リスナーが残らない)", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useIdleMeter(true));
    unmount();
    const removed = removeSpy.mock.calls.map(([name]) => name);
    expect(removed).toEqual(expect.arrayContaining(["pointerdown", "keydown", "input", "touchstart", "scroll"]));
    removeSpy.mockRestore();
  });
});
