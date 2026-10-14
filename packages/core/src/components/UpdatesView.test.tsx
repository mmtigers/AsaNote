import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpdatesView, type ReleaseEntry } from "./UpdatesView";

const releases: ReleaseEntry[] = [
  { version: "0.2.0", date: "2026-10-02", title: "新しい版", summary: "要約2", details: ["詳細A", "詳細B"] },
  { version: "0.1.0", date: "2026-10-01", title: "古い版", summary: "要約1", details: [] },
];

afterEach(cleanup);

describe("UpdatesView", () => {
  it("全履歴を新しい順(渡された順)に表示する", () => {
    render(<UpdatesView releases={releases} markVersionSeen={vi.fn()} />);

    expect(screen.getByText(/新しい版/)).toBeTruthy();
    expect(screen.getByText("詳細B")).toBeTruthy();
    expect(screen.getByText("v0.2.0・2026-10-02")).toBeTruthy();
    expect(screen.getByText(/古い版/)).toBeTruthy();
  });

  it("開いたら最新版を「見た」ことにする", () => {
    const markVersionSeen = vi.fn();
    render(<UpdatesView releases={releases} markVersionSeen={markVersionSeen} />);

    expect(markVersionSeen).toHaveBeenCalledWith("0.2.0");
    expect(markVersionSeen).toHaveBeenCalledTimes(1);
  });

  it("履歴が空なら、何も記録しない", () => {
    const markVersionSeen = vi.fn();
    render(<UpdatesView releases={[]} markVersionSeen={markVersionSeen} />);

    expect(markVersionSeen).not.toHaveBeenCalled();
  });
});
