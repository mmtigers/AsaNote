import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn().mockResolvedValue({});
const removePush = vi.hoisted(() => vi.fn());
vi.mock("@note/core/supabase/client", () => ({ getSupabaseClient: () => ({ auth: { signOut } }) }));
vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({ session: { user: { id: "u1", email: "a@example.com" } }, loading: false }),
}));
vi.mock("@/lib/db/queries", () => ({ usePendingSyncCount: () => 0 }));
vi.mock("@/lib/db/records", () => ({ countUnsyncedChanges: async () => 0 }));
vi.mock("@/lib/db/sync", () => ({ syncPendingChanges: vi.fn() }));
vi.mock("@/lib/db/localDb", () => ({ clearLocalData: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/db/notificationSettings", () => ({ removeThisDevicePushSubscription: removePush }));

import { AuthStatus } from "./AuthStatus";
import { DRAFT_STORAGE_KEY } from "@/lib/draft";

beforeEach(() => {
  removePush.mockResolvedValue(undefined);
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AuthStatus のログアウト", () => {
  it("入力途中の下書きと選択中の子どもも消す", async () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ form: { id: "x", recordDate: "2026-10-05" } }));
    window.localStorage.setItem("yoru-note:selectedChildId", "c1");

    render(<AuthStatus />);
    fireEvent.click(screen.getByRole("button", { name: /ログアウト/ }));

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    await waitFor(() => expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull());
    expect(window.localStorage.getItem("yoru-note:selectedChildId")).toBeNull();
  });

  it("この端末のPush購読をサインアウトの前に解除し、リマインドの非表示日も消す(#131)", async () => {
    window.localStorage.setItem("yoru-note:reminderDismissedDate", "2026-10-07");

    render(<AuthStatus />);
    fireEvent.click(screen.getByRole("button", { name: /ログアウト/ }));

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(removePush).toHaveBeenCalledTimes(1);
    // サーバーの購読の行はログイン中でないと消せないため、サインアウトより前に解除する
    expect(removePush.mock.invocationCallOrder[0]!).toBeLessThan(signOut.mock.invocationCallOrder[0]!);
    await waitFor(() => expect(window.localStorage.getItem("yoru-note:reminderDismissedDate")).toBeNull());
  });

  it("Push購読の解除に失敗しても、ログアウトは続ける", async () => {
    removePush.mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(<AuthStatus />);
    fireEvent.click(screen.getByRole("button", { name: /ログアウト/ }));

    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });
});
