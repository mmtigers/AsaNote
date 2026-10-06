import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  afterEach(cleanup);

  it("閉じているときは何も表示しない", () => {
    render(<ConfirmDialog open={false} message="消しますか?" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("Escapeキーでキャンセルされる", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmDialog open message="消しますか?" onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("開いたときは安全側のキャンセルにフォーカスがある", () => {
    render(<ConfirmDialog open message="消しますか?" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "キャンセル" }));
  });

  it("閉じた後はEscapeに反応しない", () => {
    const onCancel = vi.fn();
    const { rerender } = render(<ConfirmDialog open message="消しますか?" onConfirm={vi.fn()} onCancel={onCancel} />);
    rerender(<ConfirmDialog open={false} message="消しますか?" onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
