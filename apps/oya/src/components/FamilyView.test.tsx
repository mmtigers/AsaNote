import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "@/lib/db/family";

const mocks = vi.hoisted(() => ({
  fetchFamilyMembers: vi.fn(),
  fetchActiveInvites: vi.fn(),
  createInvite: vi.fn(),
  deleteInvite: vi.fn(),
  removeMember: vi.fn(),
  setMemberRole: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/lib/db/family", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/family")>()),
  fetchFamilyMembers: mocks.fetchFamilyMembers,
  fetchActiveInvites: mocks.fetchActiveInvites,
  createInvite: mocks.createInvite,
  deleteInvite: mocks.deleteInvite,
  removeMember: mocks.removeMember,
  setMemberRole: mocks.setMemberRole,
}));

import { FamilyView } from "./FamilyView";

const admin: Member = { userId: "a", familyId: "f", role: "admin", displayName: "長男", joinedAt: "1" };
const father: Member = { userId: "p", familyId: "f", role: "parent", displayName: "父", joinedAt: "2" };
const viewer: Member = { userId: "v", familyId: "f", role: "viewer", displayName: "長女", joinedAt: "3" };

beforeEach(() => {
  mocks.fetchFamilyMembers.mockResolvedValue([admin, father, viewer]);
  mocks.fetchActiveInvites.mockResolvedValue([]);
  mocks.createInvite.mockResolvedValue("ABCD2345");
  mocks.removeMember.mockResolvedValue(undefined);
  mocks.setMemberRole.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FamilyView(家族管理者)", () => {
  it("招待コードを発行して表示する", async () => {
    render(<FamilyView me={admin} onChanged={vi.fn()} />);
    await screen.findByText("父");
    fireEvent.change(screen.getByLabelText("役割"), { target: { value: "parent" } });
    fireEvent.change(screen.getByLabelText(/呼び名/), { target: { value: "母" } });
    fireEvent.click(screen.getByRole("button", { name: "招待コードを発行する" }));
    expect(await screen.findByText("ABCD2345")).toBeTruthy();
    expect(mocks.createInvite).toHaveBeenCalledWith("parent", "母");
  });

  it("ほかのメンバーの役割を変えられる", async () => {
    render(<FamilyView me={admin} onChanged={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText("長女さんの役割"), { target: { value: "admin" } });
    await vi.waitFor(() => expect(mocks.setMemberRole).toHaveBeenCalledWith("v", "admin"));
  });

  it("メンバーを外すときは確認してから", async () => {
    render(<FamilyView me={admin} onChanged={vi.fn()} />);
    const item = (await screen.findByText("父")).closest("li")!;
    fireEvent.click(within(item).getByRole("button", { name: "家族から外す" }));
    expect(mocks.removeMember).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "外す" }));
    await vi.waitFor(() => expect(mocks.removeMember).toHaveBeenCalledWith("p"));
  });

  it("最後の家族管理者が抜けようとすると、サーバーの拒否を案内する", async () => {
    mocks.removeMember.mockRejectedValue({ message: "last_admin" });
    render(<FamilyView me={admin} onChanged={vi.fn()} />);
    await screen.findByText("父");
    fireEvent.click(screen.getByRole("button", { name: "家族から抜ける" }));
    fireEvent.click(screen.getByRole("button", { name: "抜ける" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/家族管理者が誰もいなくなる/);
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe("FamilyView(親・閲覧者)", () => {
  it("メンバーの一覧だけで、招待・役割の変更・外す操作は出さない", async () => {
    render(<FamilyView me={father} onChanged={vi.fn()} />);
    await screen.findByText("長男");
    expect(screen.queryByRole("button", { name: "招待コードを発行する" })).toBeNull();
    expect(screen.queryByRole("button", { name: "家族から外す" })).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(mocks.fetchActiveInvites).not.toHaveBeenCalled();
  });

  it("自分で家族から抜け、所属を読み直してホームへ戻る", async () => {
    const onChanged = vi.fn().mockResolvedValue(undefined);
    render(<FamilyView me={father} onChanged={onChanged} />);
    await screen.findByText("長男");
    fireEvent.click(screen.getByRole("button", { name: "家族から抜ける" }));
    fireEvent.click(screen.getByRole("button", { name: "抜ける" }));
    await vi.waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
    expect(mocks.removeMember).toHaveBeenCalledWith("p");
    expect(onChanged).toHaveBeenCalled();
  });
});
