import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
  getSupabaseClient: vi.fn(),
}));

vi.mock("./supabase/client", () => ({ getSupabaseClient: mocks.getSupabaseClient }));

import { AuthProvider, useAuth } from "./auth";

type AuthListener = (event: string, session: unknown) => void;
let authListener: AuthListener | undefined;

function Probe() {
  const { session, loading } = useAuth();
  return <div data-testid="state">{loading ? "loading" : session ? "signed-in" : "signed-out"}</div>;
}

beforeEach(() => {
  authListener = undefined;
  mocks.getSupabaseClient.mockReturnValue({
    auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange },
  });
  mocks.onAuthStateChange.mockImplementation((listener: AuthListener) => {
    authListener = listener;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AuthProvider", () => {
  it("セッションが無ければ signed-out になり、復元コールバックは呼ばない", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    const onSessionRestored = vi.fn();

    render(
      <AuthProvider onSessionRestored={onSessionRestored}>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("signed-out"));
    expect(onSessionRestored).not.toHaveBeenCalled();
  });

  it("起動時にセッションを復元できたら onSessionRestored を呼ぶ", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    const onSessionRestored = vi.fn();

    render(
      <AuthProvider onSessionRestored={onSessionRestored}>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("signed-in"));
    expect(onSessionRestored).toHaveBeenCalledTimes(1);
  });

  it("SIGNED_IN の時だけ onSignedIn を呼び、セッションがあれば onSessionActive を呼ぶ", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    const onSignedIn = vi.fn();
    const onSessionActive = vi.fn();

    render(
      <AuthProvider onSignedIn={onSignedIn} onSessionActive={onSessionActive}>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(authListener).toBeDefined());

    act(() => authListener?.("TOKEN_REFRESHED", { user: { id: "u1" } }));
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(onSessionActive).toHaveBeenCalledTimes(1);

    act(() => authListener?.("SIGNED_IN", { user: { id: "u1" } }));
    expect(onSignedIn).toHaveBeenCalledTimes(1);
    expect(onSessionActive).toHaveBeenCalledTimes(2);

    act(() => authListener?.("SIGNED_OUT", null));
    expect(onSessionActive).toHaveBeenCalledTimes(2);
  });

  it("Supabase が未設定(クライアントを作れない)でも、読み込み完了として動く", async () => {
    mocks.getSupabaseClient.mockImplementation(() => {
      throw new Error("not configured");
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("signed-out"));
  });

  it("アンマウント後にセッション取得が解決しても、購読を張らない(あさノートへ入れた修正)", async () => {
    let resolveSession: (value: unknown) => void = () => {};
    mocks.getSession.mockReturnValue(new Promise((resolve) => (resolveSession = resolve)));
    const onSessionRestored = vi.fn();

    const { unmount } = render(
      <AuthProvider onSessionRestored={onSessionRestored}>
        <Probe />
      </AuthProvider>,
    );
    unmount();
    await act(async () => resolveSession({ data: { session: { user: { id: "u1" } } } }));

    expect(mocks.onAuthStateChange).not.toHaveBeenCalled();
    expect(onSessionRestored).not.toHaveBeenCalled();
  });

  it("アンマウント時に購読を解除する", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });

    const { unmount } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(mocks.onAuthStateChange).toHaveBeenCalled());
    unmount();

    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
