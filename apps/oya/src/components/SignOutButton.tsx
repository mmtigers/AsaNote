"use client";

import { useState } from "react";
import { describeServerError } from "@/lib/errors";
import { clearAllDrafts } from "@/lib/recordDraft";
import { db } from "@/lib/supabase";

// ログアウト。共有の端末で、前の人のログインや入力途中の記録(下書き)が、次の人に残らないようにする。
// 記録の正はサーバーなので、端末に残るのは下書きだけ。
export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function signOut() {
    setBusy(true);
    setErrorMessage(null);
    try {
      const { error } = await db().auth.signOut();
      if (error) throw error;
      clearAllDrafts();
    } catch (error) {
      setErrorMessage(describeServerError(error, "ログアウトできませんでした。もう一度お試しください。"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={busy}
        className="self-start text-base text-[var(--sub)] underline underline-offset-2 disabled:opacity-60"
      >
        ログアウト
      </button>
      {errorMessage && <p role="alert" className="text-base text-[var(--holiday)]">{errorMessage}</p>}
    </div>
  );
}
