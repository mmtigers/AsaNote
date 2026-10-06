import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomNav } from "./BottomNav";

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

describe("BottomNav", () => {
  afterEach(cleanup);

  it("5つのタブを表示する", () => {
    render(<BottomNav />);
    for (const label of ["記録する", "これまで", "傾向", "試したこと", "共有"]) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toBeTruthy();
    }
  });

  it("現在地のタブだけ強調する", () => {
    pathname.value = "/timeline";
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: /これまで/ }).className).toContain("font-semibold");
    expect(screen.getByRole("link", { name: /記録する/ }).className).not.toContain("font-semibold");
  });
});
