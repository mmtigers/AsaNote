import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reportSyncOutcome } from "@/lib/db/syncStatus";
import { SyncFailureNotice } from "./SyncFailureNotice";

beforeEach(() => {
  reportSyncOutcome(true);
});

afterEach(() => {
  cleanup();
});

describe("SyncFailureNotice", () => {
  it("失敗が閾値未満の間は何も表示しない", () => {
    act(() => {
      reportSyncOutcome(false);
    });
    render(<SyncFailureNotice />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("失敗が3回連続すると通知を表示する", () => {
    act(() => {
      reportSyncOutcome(false);
      reportSyncOutcome(false);
      reportSyncOutcome(false);
    });
    render(<SyncFailureNotice />);
    expect(screen.getByRole("status").textContent).toContain("同期がうまくいっていません");
  });

  it("「閉じる」を押すと通知が消える", () => {
    act(() => {
      reportSyncOutcome(false);
      reportSyncOutcome(false);
      reportSyncOutcome(false);
    });
    render(<SyncFailureNotice />);
    expect(screen.queryByRole("status")).not.toBeNull();

    act(() => {
      screen.getByRole("button", { name: "閉じる" }).click();
    });

    expect(screen.queryByRole("status")).toBeNull();
  });
});
