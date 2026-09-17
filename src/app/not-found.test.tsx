import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import NotFound from "./not-found";

afterEach(() => {
  cleanup();
});

describe("not-found.tsx", () => {
  it("日本語の404画面を表示する", () => {
    render(<NotFound />);

    expect(screen.getByRole("heading", { name: "ページが見つかりません" })).toBeTruthy();
  });

  it("ホームへ戻る導線がある", () => {
    render(<NotFound />);

    const link = screen.getByRole("link", { name: "ホームへ戻る" });
    expect(link.getAttribute("href")).toBe("/");
  });
});
