"use client";

import { useState } from "react";
import { describeServerError } from "@/lib/errors";
import { db } from "@/lib/supabase";

// ログアウト。共有の端末で、前の人のログインが残らないようにするため。
// 記録は端末に保存しない(オンラインで保存する)ので、消すべき端末内のデータは無い。
export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function signOut() {
    setBusy(true);
    setErrorMessage(null);
    try {
      const { error } = await db().auth.signOut();
      if (error) throw error;
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
