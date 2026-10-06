import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// useAuth は AuthContext を読むだけなので、Provider で包むより差し替える方が簡単。
// vi.mock はファイル先頭へ巻き上げられるため、モック関数は vi.hoisted() で用意する。
const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: useAuthMock }));

import { useAuthedList } from "./useAuthedList";

// Session の実体は使わないので、真偽だけ合っていればよい
const SIGNED_IN = { user: { id: "me" } } as never;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useAuthedList", () => {
  it("認証情報の読み込み中は null(fetch も走らせない)", () => {
    useAuthMock.mockReturnValue({ session: null, loading: true });
    const fetchList = vi.fn().mockResolvedValue([1]);

    const { result } = renderHook(() => useAuthedList(fetchList, { whenSignedOut: "empty" }));

    expect(result.current).toBeNull();
    expect(fetchList).not.toHaveBeenCalled();
  });

  // useChildren 側の挙動。未確定を「0件」と誤解させないため null を返す。
  it('未ログイン + whenSignedOut:"null" なら null', async () => {
    useAuthMock.mockReturnValue({ session: null, loading: false });
    const fetchList = vi.fn().mockResolvedValue([1]);

    const { result } = renderHook(() => useAuthedList(fetchList, { whenSignedOut: "null" }));

    await waitFor(() => expect(result.current).toBeNull());
    expect(fetchList).not.toHaveBeenCalled();
  });

  // useGroupMembers 側の挙動。未ログインならパートナーは居ないと言い切れる。
  it('未ログイン + whenSignedOut:"empty" なら空配列', async () => {
    useAuthMock.mockReturnValue({ session: null, loading: false });
    const fetchList = vi.fn().mockResolvedValue([1]);

    const { result } = renderHook(() => useAuthedList(fetchList, { whenSignedOut: "empty" }));

    await waitFor(() => expect(result.current).toEqual([]));
    expect(fetchList).not.toHaveBeenCalled();
  });

  it("ログイン中は取得結果を返す", async () => {
    useAuthMock.mockReturnValue({ session: SIGNED_IN, loading: false });
    const fetchList = vi.fn().mockResolvedValue(["a", "b"]);

    const { result } = renderHook(() => useAuthedList(fetchList, { whenSignedOut: "null" }));

    await waitFor(() => expect(result.current).toEqual(["a", "b"]));
    expect(fetchList).toHaveBeenCalledTimes(1);
  });

  it("0件でも(null ではなく)空配列として確定する", async () => {
    useAuthMock.mockReturnValue({ session: SIGNED_IN, loading: false });
    const fetchList = vi.fn().mockResolvedValue([]);

    const { result } = renderHook(() => useAuthedList(fetchList, { whenSignedOut: "null" }));

    await waitFor(() => expect(result.current).toEqual([]));
  });

  it("取得に失敗しても throw せず空配列へフォールバックする", async () => {
    useAuthMock.mockReturnValue({ session: SIGNED_IN, loading: false });
    const fetchList = vi.fn().mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useAuthedList(fetchList, { whenSignedOut: "null" }));

    await waitFor(() => expect(result.current).toEqual([]));
  });

  // 呼び出し側は { whenSignedOut: "null" } をレンダーごとに新しく作って渡す。
  // 依存配列にオブジェクトそのものを入れていると毎レンダー再取得して無限ループになるため、
  // 中で文字列へ分解している。再レンダーしても取得が増えないことを固定する。
  it("再レンダーしても取得を繰り返さない", async () => {
    useAuthMock.mockReturnValue({ session: SIGNED_IN, loading: false });
    const fetchList = vi.fn().mockResolvedValue(["a"]);

    const { result, rerender } = renderHook(() =>
      useAuthedList(fetchList, { whenSignedOut: "null" })
    );
    await waitFor(() => expect(result.current).toEqual(["a"]));

    rerender();
    rerender();

    expect(fetchList).toHaveBeenCalledTimes(1);
  });

  // アンマウント後に解決した結果で setState すると React が警告を出す。
  // 実装の active フラグがそれを防いでいることを固定する。
  it("アンマウント後に解決しても state を触らない", async () => {
    useAuthMock.mockReturnValue({ session: SIGNED_IN, loading: false });
    let resolveList: (value: string[]) => void = () => {};
    const fetchList = vi.fn(
      () =>
        new Promise<string[]>((resolve) => {
          resolveList = resolve;
        })
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { unmount } = renderHook(() => useAuthedList(fetchList, { whenSignedOut: "null" }));
    unmount();
    resolveList(["late"]);
    await Promise.resolve();

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
