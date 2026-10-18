"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@note/core/auth";
import { COOLDOWN_SECONDS } from "@note/core/otpCooldown";
import { describeServerError } from "@/lib/errors";
import { otpCooldown } from "@/lib/otpCooldown";
import { db } from "@/lib/supabase";

// ログイン画面。メールに届いた数字(コード)を入力してログインする(ADR 0001 §3)。
// あさノート・よるノートの LoginView(メールのリンクを開く方式)は、ホーム画面に追加したアプリでリンクが
// ブラウザ側で開き、ログインが引き継がれないことがあるため、おやノートでは使わない。
// コードの桁数は Supabase の設定で決まる(既定は6桁)。設定を変えても入力できるよう、6〜10桁を受け付ける。
const CODE_PATTERN = /^\d{6,10}$/;

export function OtpLoginView() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const remaining = otpCooldown.getRemainingCooldown();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorageの値はSSR時点で読めないため、マウント後に一度だけ反映する
    if (remaining > 0) setCooldown(remaining);
  }, []);

  useEffect(() => {
    if (!loading && session) router.replace("/");
  }, [loading, session, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function sendCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (cooldown > 0 || busy) return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const { error } = await db().auth.signInWithOtp({ email: email.trim() });
      if (error) throw error;
      otpCooldown.rememberSentAt();
      setCooldown(COOLDOWN_SECONDS);
      setCode("");
      setStep("code");
    } catch (error) {
      setErrorMessage(describeServerError(error, "コードを送れませんでした。時間をおいて、もう一度お試しください。"));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = code.replace(/\s/g, "");
    if (!CODE_PATTERN.test(token)) {
      setErrorMessage("メールに届いた数字を、そのまま入力してください。");
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const { error } = await db().auth.verifyOtp({ email: email.trim(), token, type: "email" });
      if (error) throw error;
      router.replace("/");
    } catch (error) {
      setErrorMessage(describeServerError(error, "ログインできませんでした。もう一度お試しください。"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 pt-12 pb-10">
      <header>
        <h1 className="text-xl font-bold">ログイン</h1>
        <p className="mt-2 text-base leading-relaxed text-[var(--sub)]">
          {step === "email"
            ? "メールアドレスに、ログイン用の数字(コード)を送ります。パスワードは不要です。"
            : `${email} に送った数字を入力してください。`}
        </p>
      </header>

      {step === "email" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <input
            type="email"
            aria-label="メールアドレス"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="min-h-12 rounded-xl bg-[var(--surface-2)] px-4 py-3 text-lg outline-none placeholder:text-[var(--sub)] focus:ring-2 focus:ring-[var(--accent)]"
          />
          {errorMessage && <p role="alert" className="text-base text-[var(--holiday)]">{errorMessage}</p>}
          <button
            type="submit"
            disabled={busy || cooldown > 0}
            className="min-h-12 rounded-full bg-[var(--accent)] py-4 text-lg font-bold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-60"
          >
            {busy ? "送信中..." : cooldown > 0 ? `${cooldown}秒後に送れます` : "コードを送る"}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="flex flex-col gap-3">
          <input
            type="text"
            aria-label="メールに届いた数字"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={12}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="123456"
            className="min-h-12 rounded-xl bg-[var(--surface-2)] px-4 py-3 text-center text-2xl tracking-[0.3em] outline-none placeholder:text-[var(--sub)] focus:ring-2 focus:ring-[var(--accent)]"
          />
          {errorMessage && <p role="alert" className="text-base text-[var(--holiday)]">{errorMessage}</p>}
          <button
            type="submit"
            disabled={busy}
            className="min-h-12 rounded-full bg-[var(--accent)] py-4 text-lg font-bold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-60"
          >
            {busy ? "確認中..." : "ログインする"}
          </button>
          <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-base">
            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={busy || cooldown > 0}
              className="text-[var(--accent)] underline underline-offset-2 disabled:text-[var(--sub)] disabled:no-underline"
            >
              {cooldown > 0 ? `コードを送り直す(${cooldown}秒後)` : "コードを送り直す"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setErrorMessage(null);
              }}
              className="text-[var(--accent)] underline underline-offset-2"
            >
              メールアドレスを変える
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
