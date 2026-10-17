"use client";

import { useState, type FormEvent } from "react";
import { createFamily, redeemInvite } from "@/lib/db/family";
import { describeServerError } from "@/lib/errors";
import { useMembership } from "@/lib/membership";

// ログイン済みで、まだ家族に属していない人の画面。
// ふつうは家族管理者から受け取った招待コードで参加する(役割と呼び名は、管理者が発行時に決めている)。
// 最初の1人(家族管理者)だけが「家族を作る」を使う。
export function JoinFamilyView() {
  const { refresh } = useMembership();
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setErrorMessage(null);
    try {
      await action();
      await refresh();
    } catch (error) {
      setErrorMessage(describeServerError(error, fallback));
    } finally {
      setBusy(false);
    }
  }

  function onJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(() => redeemInvite(code), "参加できませんでした。もう一度お試しください。");
  }

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(() => createFamily(displayName), "家族を作れませんでした。もう一度お試しください。");
  }

  return (
    <section className="flex flex-col gap-6">
      <form onSubmit={onJoin} className="flex flex-col gap-3 rounded-2xl bg-[var(--surface)] p-4">
        <h2 className="text-lg font-bold">招待コードで参加する</h2>
        <p className="text-base leading-relaxed text-[var(--sub)]">家族管理者から受け取った8桁のコードを入力してください。</p>
        <input
          type="text"
          aria-label="招待コード"
          required
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={12}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="ABCD2345"
          className="min-h-12 rounded-xl bg-[var(--surface-2)] px-4 py-3 text-center text-2xl tracking-[0.2em] uppercase outline-none placeholder:text-[var(--sub)] focus:ring-2 focus:ring-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={busy}
          className="min-h-12 rounded-full bg-[var(--accent)] py-4 text-lg font-bold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-60"
        >
          {busy ? "確認中..." : "参加する"}
        </button>
      </form>

      {errorMessage && <p role="alert" className="text-base text-[var(--holiday)]">{errorMessage}</p>}

      {showCreate ? (
        <form onSubmit={onCreate} className="flex flex-col gap-3 rounded-2xl bg-[var(--surface)] p-4">
          <h2 className="text-lg font-bold">家族を作る(最初の1人だけ)</h2>
          <p className="text-base leading-relaxed text-[var(--sub)]">
            あなたが家族管理者になり、両親や家族を招待します。家族の中での呼び名を入力してください。
          </p>
          <input
            type="text"
            aria-label="あなたの呼び名"
            required
            maxLength={20}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="例: 長男"
            className="min-h-12 rounded-xl bg-[var(--surface-2)] px-4 py-3 text-lg outline-none placeholder:text-[var(--sub)] focus:ring-2 focus:ring-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={busy}
            className="min-h-12 rounded-full bg-[var(--surface-2)] py-4 text-lg font-bold text-[var(--ink)] focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
          >
            {busy ? "作成中..." : "家族を作る"}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="self-start text-base text-[var(--accent)] underline underline-offset-2"
        >
          招待コードが無い(最初の1人として家族を作る)
        </button>
      )}
    </section>
  );
}
