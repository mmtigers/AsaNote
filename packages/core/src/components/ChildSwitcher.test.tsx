// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UNASSIGNED_FILTER } from "../childFilter";
import type { Child } from "../types/group";
import { ChildSwitcher } from "./ChildSwitcher";

afterEach(cleanup);

const children: Child[] = [
  { id: "c1", name: "はな", created_by: "u1", created_at: "x" },
  { id: "c2", name: "たろう", created_by: "u1", created_at: "y" },
];

describe("ChildSwitcher", () => {
  it("allowUnassigned が無ければ「未分類」は出ない", () => {
    render(<ChildSwitcher childList={children} selectedId={null} onSelect={() => {}} allowAll />);

    expect(screen.queryByRole("button", { name: "未分類" })).toBeNull();
  });

  it("allowUnassigned なら「未分類」が出て、押すと UNASSIGNED_FILTER が渡る(#127)", () => {
    const onSelect = vi.fn();
    render(<ChildSwitcher childList={children} selectedId={null} onSelect={onSelect} allowAll allowUnassigned />);

    fireEvent.click(screen.getByRole("button", { name: "未分類" }));

    expect(onSelect).toHaveBeenCalledWith(UNASSIGNED_FILTER);
  });

  it("子どもを押すと、その子のidが渡る", () => {
    const onSelect = vi.fn();
    render(<ChildSwitcher childList={children} selectedId={null} onSelect={onSelect} allowAll allowUnassigned />);

    fireEvent.click(screen.getByRole("button", { name: "たろう" }));

    expect(onSelect).toHaveBeenCalledWith("c2");
  });
});
