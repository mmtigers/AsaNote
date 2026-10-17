import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useAuthMock, signInWithOtp, verifyOtp, replace } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@note/core/auth", () => ({ useAuth: useAuthMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/supabase", () => ({ db: () => ({ auth: { signInWithOtp, verifyOtp } }) }));

import { OtpLoginView } from "./OtpLoginView";

beforeEach(() => {
  useAuthMock.mockReturnValue({ session: null, loading: false });
  signInWithOtp.mockResolvedValue({ error: null });
  verifyOtp.mockResolvedValue({ error: null });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

async function sendCodeTo(email: string) {
  fireEvent.change(screen.getByLabelText("メールアドレス"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "コードを送る" }));
  await screen.findByLabelText("メールに届いた数字");
}

describe("OtpLoginView", () => {
  it("メールにコードを送り(リンクの戻り先は指定しない)、コードの入力欄を出す", async () => {
    render(<OtpLoginView />);
    await sendCodeTo(" a@example.com ");
    expect(signInWithOtp).toHaveBeenCalledWith({ email: "a@example.com" });
    expect(screen.getByText(/a@example.com に送った数字/)).toBeTruthy();
  });

  it("コードを確かめてログインし、ホームへ戻る", async () => {
    render(<OtpLoginView />);
    await sendCodeTo("a@example.com");
    fireEvent.change(screen.getByLabelText("メールに届いた数字"), { target: { value: "123 456" } });
    fireEvent.click(screen.getByRole("button", { name: "ログインする" }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(verifyOtp).toHaveBeenCalledWith({ email: "a@example.com", token: "123456", type: "email" });
  });

  it("数字以外・桁不足は、送らずに案内する", async () => {
    render(<OtpLoginView />);
    await sendCodeTo("a@example.com");
    fireEvent.change(screen.getByLabelText("メールに届いた数字"), { target: { value: "12ab" } });
    fireEvent.click(screen.getByRole("button", { name: "ログインする" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/数字を、そのまま入力/);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("コードの誤り・期限切れは、案内を出して入力を続けられる", async () => {
    verifyOtp.mockResolvedValue({ error: { code: "otp_expired", message: "Token has expired or is invalid" } });
    render(<OtpLoginView />);
    await sendCodeTo("a@example.com");
    fireEvent.change(screen.getByLabelText("メールに届いた数字"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "ログインする" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/コードが正しくないか/);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("メールに届いた数字")).toBeTruthy();
  });

  it("送ったあとは、しばらく送り直せない", async () => {
    render(<OtpLoginView />);
    await sendCodeTo("a@example.com");
    const resend = screen.getByRole("button", { name: /コードを送り直す/ }) as HTMLButtonElement;
    expect(resend.disabled).toBe(true);
  });

  it("ログイン済みなら、ホームへ戻す", () => {
    useAuthMock.mockReturnValue({ session: { user: { id: "u1" } }, loading: false });
    render(<OtpLoginView />);
    expect(replace).toHaveBeenCalledWith("/");
  });
});
