import { afterEach, describe, expect, it, vi } from "vitest";

const { reportHandledErrorMock } = vi.hoisted(() => ({ reportHandledErrorMock: vi.fn() }));
vi.mock("./clientErrors", () => ({ reportHandledError: reportHandledErrorMock }));

import { createLocalStorageStore } from "./localStorageStore";

afterEach(() => {
  vi.restoreAllMocks();
  reportHandledErrorMock.mockClear();
  window.localStorage.clear();
});

describe("createLocalStorageStore", () => {
  it("読み書きできる環境では、値を保存して読み戻せる(記録は送らない)", () => {
    const store = createLocalStorageStore("k", "k-changed");
    store.set("v");
    expect(store.get()).toBe("v");
    expect(reportHandledErrorMock).not.toHaveBeenCalled();
  });

  it("読めない環境では null を返し、storage/unavailable を記録する(#213)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const store = createLocalStorageStore("k", "k-changed");

    expect(store.get()).toBeNull();
    expect(reportHandledErrorMock).toHaveBeenCalledWith("storage/unavailable", expect.any(Error), { op: "get" });
  });

  it("書けない環境でも throw せず、storage/unavailable を記録する(#213)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    const store = createLocalStorageStore("k", "k-changed");

    expect(() => store.set("v")).not.toThrow();
    expect(reportHandledErrorMock).toHaveBeenCalledWith("storage/unavailable", expect.any(Error), { op: "set" });
  });
});
