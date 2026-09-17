import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ErrorBoundaryFallback from "./error";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("error.tsx", () => {
  it("日本語のフォールバックUIを表示する", () => {
    // 実装が console.error でエラーを出すので、テスト出力を汚さないよう抑える
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundaryFallback error={new Error("boom")} retry={() => {}} />);

    expect(screen.getByRole("heading", { name: "エラーが発生しました" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "やり直す" })).toBeTruthy();
  });

  // Next 16 の prop は `retry`(旧来の `reset` ではない)。
  // 名前を間違えると押しても何も起きないボタンになるため、実際に呼ばれることを固定する。
  it("「やり直す」で retry() が呼ばれる", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    render(<ErrorBoundaryFallback error={new Error("boom")} retry={retry} />);

    fireEvent.click(screen.getByRole("button", { name: "やり直す" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("digest があればサーバーログ突合用に表示する", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("boom"), { digest: "abc123" });
    render(<ErrorBoundaryFallback error={error} retry={() => {}} />);

    expect(screen.getByText(/abc123/)).toBeTruthy();
  });

  it("digest が無ければエラーIDの行を出さない", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ErrorBoundaryFallback error={new Error("boom")} retry={() => {}} />);

    expect(screen.queryByText(/エラーID/)).toBeNull();
  });

  it("サーバーログと突き合わせられるよう console.error へ出力する", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("boom");
    render(<ErrorBoundaryFallback error={error} retry={() => {}} />);

    expect(spy).toHaveBeenCalledWith(error);
  });
});
