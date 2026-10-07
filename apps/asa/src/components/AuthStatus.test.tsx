import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DRAFT_STORAGE_KEY } from "@/lib/draft";

const { signOutMock, syncPendingChangesMock, countUnsyncedChangesMock, clearLocalDataMock, removePushMock } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
  removePushMock: vi.fn(),
  syncPendingChangesMock: vi.fn(),
  countUnsyncedChangesMock: vi.fn(),
  clearLocalDataMock: vi.fn(),
}));

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({ session: { user: { email: "a@example.com" } }, loading: false }),
}));
vi.mock("@note/core/supabase/client", () => ({
  getSupabaseClient: () => ({ auth: { signOut: signOutMock } }),
}));
vi.mock("@/lib/db/sync", () => ({ syncPendingChanges: syncPendingChangesMock }));
vi.mock("@/lib/db/records", () => ({ countUnsyncedChanges: countUnsyncedChangesMock }));
vi.mock("@/lib/db/queries", () => ({ usePendingSyncCount: () => 0 }));
vi.mock("@/lib/db/localDb", () => ({ clearLocalData: clearLocalDataMock }));
vi.mock("@/lib/db/notificationSettings", () => ({ removeThisDevicePushSubscription: removePushMock }));

const { AuthStatus } = await import("./AuthStatus");

beforeEach(() => {
  signOutMock.mockResolvedValue(undefined);
  syncPendingChangesMock.mockResolvedValue(undefined);
  countUnsyncedChangesMock.mockResolvedValue(0);
  clearLocalDataMock.mockResolvedValue(undefined);
  removePushMock.mockResolvedValue(undefined);
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AuthStatus", () => {
  it("ログアウトすると、localStorageの下書きと選択中の子どもも消す(#131)", async () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ memo: "前の人のメモ" }));
    window.localStorage.setItem("asa-note:selectedChildId", "child-1");
    window.localStorage.setItem("asa-note:lastSeenReleaseVersion", "0.4.5");

    render(<AuthStatus />);
    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));

    await waitFor(() => expect(clearLocalDataMock).toHaveBeenCalled());
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull());
    expect(window.localStorage.getItem("asa-note:selectedChildId")).toBeNull();
    // 端末単位の設定(アプデ通知の既読)は対象外
    expect(window.localStorage.getItem("asa-note:lastSeenReleaseVersion")).toBe("0.4.5");
  });

  it("ログアウトすると、この端末のPush購読を解除し、リマインドの非表示日も消す(#131)", async () => {
    window.localStorage.setItem("asa-note:reminderDismissedDate", "2026-10-07");

    render(<AuthStatus />);
    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));

    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    expect(removePushMock).toHaveBeenCalledTimes(1);
    // サーバーの購読の行はログイン中でないと消せないため、サインアウトより前に解除する
    expect(removePushMock.mock.invocationCallOrder[0]!).toBeLessThan(signOutMock.mock.invocationCallOrder[0]!);
    await waitFor(() => expect(window.localStorage.getItem("asa-note:reminderDismissedDate")).toBeNull());
  });

  it("Push購読の解除に失敗しても、ログアウトと端末内データの消去は続ける", async () => {
    removePushMock.mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(<AuthStatus />);
    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));

    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    await waitFor(() => expect(clearLocalDataMock).toHaveBeenCalled());
  });
});
