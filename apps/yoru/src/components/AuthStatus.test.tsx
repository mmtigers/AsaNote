import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn().mockResolvedValue({});
vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: () => ({ auth: { signOut } }) }));
vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({ session: { user: { id: "u1", email: "a@example.com" } }, loading: false }),
}));
vi.mock("@/lib/db/queries", () => ({ usePendingSyncCount: () => 0 }));
vi.mock("@/lib/db/records", () => ({ countUnsyncedChanges: async () => 0 }));
vi.mock("@/lib/db/sync", () => ({ syncPendingChanges: vi.fn() }));
vi.mock("@/lib/db/localDb", () => ({ clearLocalData: vi.fn().mockResolvedValue(undefined) }));

import { AuthStatus } from "./AuthStatus";
import { DRAFT_STORAGE_KEY } from "@/lib/draft";

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
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
});
