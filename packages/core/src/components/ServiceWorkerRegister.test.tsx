import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceWorkerRegister } from "./ServiceWorkerRegister";

const register = vi.fn();

beforeEach(() => {
  register.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "serviceWorker", { value: { register }, configurable: true });
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
});
