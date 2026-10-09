import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceWorkerRegister } from "./ServiceWorkerRegister";

const register = vi.fn();
const postMessage = vi.fn();

beforeEach(() => {
  postMessage.mockReset();
  register.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "serviceWorker", {
    value: { register, ready: Promise.resolve({ active: { postMessage } }) },
    configurable: true,
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("ServiceWorkerRegister", () => {
  it("/sw.js を登録し、登録後のコールバック(onRegistered)を呼ぶ", () => {
    const onRegistered = vi.fn();
    render(<ServiceWorkerRegister onRegistered={onRegistered} />);

    expect(register).toHaveBeenCalledWith("/sw.js");
    expect(onRegistered).toHaveBeenCalledTimes(1);
  });

  it("登録に失敗しても throw せず、onRegistered は呼ぶ", async () => {
    register.mockRejectedValue(new Error("blocked"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onRegistered = vi.fn();

    render(<ServiceWorkerRegister onRegistered={onRegistered} />);
    await Promise.resolve();

    expect(onRegistered).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("onRegistered は省略できる", () => {
    expect(() => render(<ServiceWorkerRegister />)).not.toThrow();
  });

  it("読み込み済みの /_next/static/ の JS/CSS を Service Worker に渡して、キャッシュさせる(#133)", async () => {
    const getEntries = vi.spyOn(performance, "getEntriesByType").mockReturnValue([
      { name: `${window.location.origin}/_next/static/chunks/a.js` },
      { name: `${window.location.origin}/icons/icon-192.png` },
    ] as unknown as PerformanceEntryList);

    render(<ServiceWorkerRegister />);

    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith({ type: "CACHE_STATIC_URLS", paths: ["/_next/static/chunks/a.js"] })
    );
    getEntries.mockRestore();
  });

  it("渡すものが無ければ、メッセージは送らない", async () => {
    const getEntries = vi.spyOn(performance, "getEntriesByType").mockReturnValue([]);

    render(<ServiceWorkerRegister />);
    await Promise.resolve();
    await Promise.resolve();

    expect(postMessage).not.toHaveBeenCalled();
    getEntries.mockRestore();
  });

  it("onRegistered が返した解除用の関数を、アンマウント時に呼ぶ", () => {
    const stop = vi.fn();
    const { unmount } = render(<ServiceWorkerRegister onRegistered={() => stop} />);

    expect(stop).not.toHaveBeenCalled();
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
