import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useAuthMock, fetchMyMembership, rejectWith } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  fetchMyMembership: vi.fn(),
  // 失敗させるときは vi.fn を通さず、素の関数で reject する。vi.fn が reject した Promise を記録すると、
  // 呼び出し側で catch していても、テストの失敗として報告されるため(このテストの実装の都合)。
  rejectWith: { error: null as unknown },
}));
vi.mock("@note/core/auth", () => ({ useAuth: useAuthMock }));
vi.mock("@/lib/db/family", () => ({
  fetchMyMembership: (userId: string) => (rejectWith.error ? Promise.reject(rejectWith.error) : fetchMyMembership(userId)),
}));

import { MembershipProvider, useMembership } from "./membership";

function Probe() {
  const { state } = useMembership();
  return <p data-testid="state">{state.status === "member" ? `member:${state.member.role}` : state.status}</p>;
}

function renderWith() {
  render(
    <MembershipProvider>
      <Probe />
    </MembershipProvider>
  );
}

beforeEach(() => {
  fetchMyMembership.mockReset();
  rejectWith.error = null;
});
afterEach(() => cleanup());

describe("MembershipProvider", () => {
  it("ログイン状態の確認中は loading", () => {
    useAuthMock.mockReturnValue({ session: null, loading: true });
    renderWith();
    expect(screen.getByTestId("state").textContent).toBe("loading");
  });

  it("未ログインは signed-out(サーバーに問い合わせない)", () => {
    useAuthMock.mockReturnValue({ session: null, loading: false });
    renderWith();
    expect(screen.getByTestId("state").textContent).toBe("signed-out");
    expect(fetchMyMembership).not.toHaveBeenCalled();
  });

  it("家族に属していなければ no-family", async () => {
    useAuthMock.mockReturnValue({ session: { user: { id: "u1" } }, loading: false });
    fetchMyMembership.mockResolvedValue(null);
    renderWith();
    await vi.waitFor(() => expect(screen.getByTestId("state").textContent).toBe("no-family"));
    expect(fetchMyMembership).toHaveBeenCalledWith("u1");
  });

  it("所属していれば、役割と一緒に member", async () => {
    useAuthMock.mockReturnValue({ session: { user: { id: "u1" } }, loading: false });
    fetchMyMembership.mockResolvedValue({ userId: "u1", familyId: "f1", role: "parent", displayName: "父", joinedAt: "" });
    renderWith();
    await vi.waitFor(() => expect(screen.getByTestId("state").textContent).toBe("member:parent"));
  });

  it("読み込みに失敗したら error", async () => {
    useAuthMock.mockReturnValue({ session: { user: { id: "u1" } }, loading: false });
    rejectWith.error = new TypeError("Failed to fetch");
    renderWith();
    await vi.waitFor(() => expect(screen.getByTestId("state").textContent).toBe("error"));
  });
});
