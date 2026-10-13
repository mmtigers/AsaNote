import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reportMock = vi.fn();
vi.mock("../clientErrors", () => ({
  reportClientError: (...args: unknown[]) => reportMock(...args),
  registerClientErrorApp: () => {},
}));

const { ClientErrorReporter } = await import("./ClientErrorReporter");

// jsdom は dispatch した ErrorEvent を未処理の例外としてテスト全体の失敗にするため、握りつぶす。
const swallow = (event: Event) => event.preventDefault();
beforeEach(() => window.addEventListener("error", swallow));

afterEach(() => {
  window.removeEventListener("error", swallow);
  cleanup();
  reportMock.mockClear();
});

describe("ClientErrorReporter", () => {
  it("window の error イベントを送る", () => {
    render(<ClientErrorReporter app="asa" appVersion="1.0.0" />);
    const error = new Error("boom");

    window.dispatchEvent(new ErrorEvent("error", { error }));

    expect(reportMock).toHaveBeenCalledWith("asa", "window-error", error, "1.0.0");
  });

  it("リソース読み込み失敗など error の無いイベントは送らない", () => {
    render(<ClientErrorReporter app="asa" />);

    window.dispatchEvent(new ErrorEvent("error", { message: "x" }));

    expect(reportMock).not.toHaveBeenCalled();
  });

  it("unhandledrejection を送る", () => {
    render(<ClientErrorReporter app="yoru" />);
    const event = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.assign(event, { reason: "nope" });

    window.dispatchEvent(event);

    expect(reportMock).toHaveBeenCalledWith("yoru", "unhandled-rejection", "nope", undefined);
  });

  it("アンマウント後は送らない", () => {
    const { unmount } = render(<ClientErrorReporter app="asa" />);
    unmount();

    window.dispatchEvent(new ErrorEvent("error", { error: new Error("late") }));

    expect(reportMock).not.toHaveBeenCalled();
  });
});
