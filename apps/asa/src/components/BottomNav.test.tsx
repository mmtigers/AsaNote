// @vitest-environment jsdom
/**
 * 記録フローの途中で「記録する」タブを押しても、既にホーム(`/`)にいるため Link では
 * 画面が作り直されず、ステップがそのまま残ってしまっていた。その場合だけ
 * 「最初の画面へ戻す」通知を出すようにしたので、出す/出さないの条件を固定する。
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  usePathname: vi.fn(),
  useHasDraft: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: mocks.usePathname }));
vi.mock("@/lib/draft", () => ({ useHasDraft: mocks.useHasDraft }));

import { BottomNav } from "./BottomNav";

// jsdomは実際の画面遷移を実装していないため、リンクの既定動作だけ止めておく。
function preventNavigation(e: Event) {
  e.preventDefault();
}

let resetCount = 0;
const onReset: EventListener = () => {
  resetCount += 1;
};

beforeEach(() => {
  mocks.useHasDraft.mockReturnValue(false);
  resetCount = 0;
  window.addEventListener("asa-note:record-flow-reset", onReset);
  document.addEventListener("click", preventNavigation);
});

afterEach(() => {
  window.removeEventListener("asa-note:record-flow-reset", onReset);
  document.removeEventListener("click", preventNavigation);
  cleanup();
  vi.clearAllMocks();
});

describe("BottomNav", () => {
  it("ホームにいるときの「記録する」は、記録フローを最初の画面へ戻す通知を出す", () => {
    mocks.usePathname.mockReturnValue("/");
    render(<BottomNav />);

    fireEvent.click(screen.getByRole("link", { name: /記録する/ }));

    expect(resetCount).toBe(1);
  });

  it("他の画面にいるときの「記録する」は通知を出さない(ホームへの遷移だけで足りる)", () => {
    mocks.usePathname.mockReturnValue("/timeline");
    render(<BottomNav />);

    fireEvent.click(screen.getByRole("link", { name: /記録する/ }));

    expect(resetCount).toBe(0);
  });

  it("「記録する」以外のタブでは通知を出さない", () => {
    mocks.usePathname.mockReturnValue("/timeline");
    render(<BottomNav />);

    fireEvent.click(screen.getByRole("link", { name: /これまで/ }));

    expect(resetCount).toBe(0);
  });
});
