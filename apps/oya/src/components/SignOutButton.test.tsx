import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ db: () => ({ auth: { signOut } }) }));

import { EMPTY_INPUT } from "@/lib/db/records";
import { loadDraft, saveDraft } from "@/lib/recordDraft";
import { SignOutButton } from "./SignOutButton";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("SignOutButton", () => {
  it("ログアウトしたら、この端末の下書きを消す(共有の端末で次の人に残さない)", async () => {
    signOut.mockResolvedValue({ error: null });
    saveDraft("u1", "2026-10-17", { ...EMPTY_INPUT, memo: "途中" });
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));
    await vi.waitFor(() => expect(loadDraft("u1", "2026-10-17")).toBeNull());
  });

  it("ログアウトに失敗したら、下書きは消さない", async () => {
    signOut.mockResolvedValue({ error: { message: "network" } });
    saveDraft("u1", "2026-10-17", { ...EMPTY_INPUT, memo: "途中" });
    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));
    await screen.findByRole("alert");
    expect(loadDraft("u1", "2026-10-17")).not.toBeNull();
  });
});
