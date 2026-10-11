// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BottomNav } from "./BottomNav";

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

const items = [
  { href: "/", label: "記録する", icon: "📝" },
  { href: "/timeline", label: "これまで", icon: "📅" },
  { href: "/group", label: "共有", icon: "👨‍👩‍👧" },
] as const;

// jsdomは実際の画面遷移を実装していないため、リンクの既定動作だけ止めておく。
function preventNavigation(e: Event) {
  e.preventDefault();
}

beforeEach(() => {
  pathname.value = "/";
  document.addEventListener("click", preventNavigation);
});

afterEach(() => {
  document.removeEventListener("click", preventNavigation);
  cleanup();
});

describe("BottomNav", () => {
  it("渡された項目をすべてリンクとして表示し、ナビに名前を付ける", () => {
    render(<BottomNav items={items} hasDraft={false} onHomeReselect={vi.fn()} />);
    expect(screen.getByRole("navigation", { name: "メインメニュー" })).toBeTruthy();
    for (const item of items) {
      expect(screen.getByRole("link", { name: new RegExp(item.label) }).getAttribute("href")).toBe(item.href);
    }
  });

  it("現在地のタブだけ強調し、aria-current を付ける", () => {
    pathname.value = "/timeline";
    render(<BottomNav items={items} hasDraft={false} onHomeReselect={vi.fn()} />);
    const current = screen.getByRole("link", { name: /これまで/ });
    expect(current.className).toContain("font-semibold");
    expect(current.getAttribute("aria-current")).toBe("page");
    const other = screen.getByRole("link", { name: /共有/ });
    expect(other.className).not.toContain("font-semibold");
    expect(other.getAttribute("aria-current")).toBeNull();
  });

  it("入力途中の記録があるときだけ、ホームのタブに読み上げ用の文言を出す", () => {
    const { rerender } = render(<BottomNav items={items} hasDraft={false} onHomeReselect={vi.fn()} />);
    expect(screen.queryByText("(入力途中の記録があります)")).toBeNull();
    rerender(<BottomNav items={items} hasDraft onHomeReselect={vi.fn()} />);
    expect(screen.getByRole("link", { name: /記録する/ }).textContent).toContain("(入力途中の記録があります)");
    expect(screen.getByRole("link", { name: /これまで/ }).textContent).not.toContain("入力途中");
  });

  it("ホームにいるときのホームのタブだけ、onHomeReselect を呼ぶ", () => {
    const onHomeReselect = vi.fn();
    render(<BottomNav items={items} hasDraft={false} onHomeReselect={onHomeReselect} />);
    fireEvent.click(screen.getByRole("link", { name: /これまで/ }));
    expect(onHomeReselect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: /記録する/ }));
    expect(onHomeReselect).toHaveBeenCalledTimes(1);
  });

  it("他の画面にいるときのホームのタブは、onHomeReselect を呼ばない", () => {
    pathname.value = "/timeline";
    const onHomeReselect = vi.fn();
    render(<BottomNav items={items} hasDraft={false} onHomeReselect={onHomeReselect} />);
    fireEvent.click(screen.getByRole("link", { name: /記録する/ }));
    expect(onHomeReselect).not.toHaveBeenCalled();
  });
});
