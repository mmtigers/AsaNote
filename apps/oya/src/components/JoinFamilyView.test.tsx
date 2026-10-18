import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { redeemInvite, createFamily, refresh } = vi.hoisted(() => ({
  redeemInvite: vi.fn(),
  createFamily: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/db/family", () => ({ redeemInvite, createFamily }));
vi.mock("@/lib/membership", () => ({ useMembership: () => ({ refresh }) }));

import { JoinFamilyView } from "./JoinFamilyView";

beforeEach(() => {
  redeemInvite.mockResolvedValue("f1");
  createFamily.mockResolvedValue("f1");
  refresh.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("JoinFamilyView", () => {
  it("招待コードで参加し、所属を読み直す", async () => {
    render(<JoinFamilyView />);
    fireEvent.change(screen.getByLabelText("招待コード"), { target: { value: "abcd2345" } });
    fireEvent.click(screen.getByRole("button", { name: "参加する" }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(redeemInvite).toHaveBeenCalledWith("abcd2345");
  });

  it("コードが使えないときは案内を出し、所属は変えない", async () => {
    redeemInvite.mockRejectedValue({ message: "invite_invalid" });
    render(<JoinFamilyView />);
    fireEvent.change(screen.getByLabelText("招待コード"), { target: { value: "XXXXXXXX" } });
    fireEvent.click(screen.getByRole("button", { name: "参加する" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/招待コードが正しくないか/);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("家族を作る操作は、明示的に開いたときだけ出す", async () => {
    render(<JoinFamilyView />);
    expect(screen.queryByLabelText("あなたの呼び名")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /家族を作る\)/ }));
    fireEvent.change(screen.getByLabelText("あなたの呼び名"), { target: { value: "長男" } });
    fireEvent.click(screen.getByRole("button", { name: "家族を作る" }));
    await vi.waitFor(() => expect(createFamily).toHaveBeenCalledWith("長男"));
    expect(refresh).toHaveBeenCalled();
  });
});
