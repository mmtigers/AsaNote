"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { isNetworkError, NETWORK_ERROR_MESSAGE_JA } from "@/lib/errors";
import { COOLDOWN_SECONDS, getRemainingCooldown, rememberSentAt } from "@/lib/otpCooldown";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const remaining = getRemainingCooldown();
    if (remaining > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorageの値はSSR時点で読めないため、マウント後に一度だけ反映する
      setCooldown(remaining);
    }
  }, []);

  useEffect(() => {
    if (!loading && session) {
      router.replace("/");
    }
  }, [loading, session, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cooldown > 0) return;

    setSending(true);
    setErrorMessage(null);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      rememberSentAt();
      setCooldown(COOLDOWN_SECONDS);
      setSent(true);
    } catch (error) {
      setErrorMessage(
        isNetworkError(error)
          ? NETWORK_ERROR_MESSAGE_JA
          : error instanceof Error
            ? error.message
            : "ログインリンクの送信に失敗しました"
      );
    } finally {
      setSending(false);
    }
  }

  const submitLabel = sending
    ? "送信中..."
    : cooldown > 0
      ? `${cooldown}秒後に再送信できます`
      : "ログインリンクを送る";

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 pt-12">
      <header>
        <h1 className="text-lg font-bold">ログイン</h1>
        <p className="mt-1 text-sm text-[var(--sub)]">
          メールアドレス宛にログイン用のリンクを送ります。パスワードは不要です。
        </p>
      </header>

      {sent ? (
        <div className="flex flex-col gap-3 rounded-xl bg-[var(--surface-2)] p-4 text-sm text-[var(--ink)]">
          <p>
            <span className="font-semibold text-[var(--accent)]">{email}</span>{" "}
            にログインリンクを送信しました。メール内のリンクを開いてください。
          </p>
          <button
            type="button"
            onClick={() => setSent(false)}
            disabled={cooldown > 0}
            className="self-start text-xs text-[var(--accent)] underline underline-offset-2 focus:ring-2 focus:ring-[var(--accent)] disabled:text-[var(--sub)] disabled:no-underline"
          >
            別のメールアドレスで送り直す{cooldown > 0 && `（${cooldown}秒後）`}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            aria-label="メールアドレス"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className="rounded-xl bg-[var(--surface-2)] px-4 py-3 text-base outline-none placeholder:text-[var(--sub)] focus:ring-2 focus:ring-[var(--accent)]"
          />
          {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
          <button
            type="submit"
            disabled={sending || cooldown > 0}
            className="rounded-full bg-[var(--accent)] py-4 text-base font-semibold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-60"
          >
            {submitLabel}
          </button>
        </form>
      )}

      <p className="text-xs text-[var(--sub)]">
        ログインしなくてもこの端末での記録・閲覧は可能です。ログインすると家族と記録が同期されます。
      </p>
    </main>
  );
}
