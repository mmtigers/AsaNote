import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OtpCooldown } from "../otpCooldown";

const { useAuthMock, signInWithOtp, replace } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  signInWithOtp: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("../auth", () => ({ useAuth: useAuthMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("../supabase/client", () => ({ getSupabaseClient: () => ({ auth: { signInWithOtp } }) }));

import { LoginView } from "./LoginView";

function cooldownStub(remaining = 0) {
  const rememberSentAt = vi.fn<OtpCooldown["rememberSentAt"]>();
  const cooldown: OtpCooldown = { getRemainingCooldown: () => remaining, rememberSentAt };
  return Object.assign(cooldown, { rememberSentAt });
}

beforeEach(() => {
  useAuthMock.mockReturnValue({ session: null, loading: false });
  signInWithOtp.mockResolvedValue({ error: null });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function submit(email = "a@example.com") {
  fireEvent.change(screen.getByLabelText("メールアドレス"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /ログインリンクを送る/ }));
}

describe("LoginView", () => {
  it("メールを送ったら、送信時刻を記録し、案内を出す", async () => {
    const cooldown = cooldownStub();
    render(<LoginView cooldown={cooldown} />);

    submit();

    await screen.findByText(/にログインリンクを送信しました/);
    expect(signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: "a@example.com" }));
    expect(cooldown.rememberSentAt).toHaveBeenCalledTimes(1);
  });

  it("クールダウン中は送信できない", () => {
    render(<LoginView cooldown={cooldownStub(20)} />);

    expect((screen.getByRole("button", { name: /20秒後に再送信できます/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("送信に失敗したら、エラーを出し、送信時刻は記録しない", async () => {
    signInWithOtp.mockResolvedValue({ error: new Error("rate limit") });
    const cooldown = cooldownStub();
    render(<LoginView cooldown={cooldown} />);

    submit();

    await screen.findByText("rate limit");
    expect(cooldown.rememberSentAt).not.toHaveBeenCalled();
  });

  it("ログイン済みならホームへ移る", async () => {
    useAuthMock.mockReturnValue({ session: { user: { id: "u" } }, loading: false });
    render(<LoginView cooldown={cooldownStub()} />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });
});
