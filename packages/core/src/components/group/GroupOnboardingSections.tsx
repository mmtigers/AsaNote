"use client";

import type { GroupAdmin } from "../../group/useGroupAdmin";

// まだグループに属していないときの2択(作る / 招待コードで参加する)(#62)。
export function GroupOnboardingSections({ admin }: { admin: GroupAdmin }) {
  return (
    <>
      <section className="flex flex-col gap-3 rounded-2xl bg-[var(--surface-2)] p-4">
        <h2 className="text-sm font-semibold text-[var(--sub)]">グループを作る</h2>
        <p className="text-xs text-[var(--sub)]">
          作成すると、あなたの記録が今後グループメンバーと自動的に共有されます。
        </p>
        <button
          type="button"
          onClick={() => void admin.create()}
          disabled={admin.creating}
          className="rounded-full bg-[var(--accent)] py-3 text-sm font-semibold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
        >
          {admin.creating ? "作成中..." : "グループを作る"}
        </button>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-[var(--surface-2)] p-4">
        <h2 className="text-sm font-semibold text-[var(--sub)]">招待コードを持っている</h2>
        <input
          aria-label="招待コード"
          value={admin.joinCodeInput}
          onChange={(event) => admin.setJoinCodeInput(event.target.value)}
          placeholder="招待コードを入力"
          maxLength={16}
          className="rounded-xl bg-[var(--surface)] px-4 py-3 text-base tracking-widest outline-none placeholder:text-[var(--sub)] placeholder:tracking-normal focus:ring-2 focus:ring-[var(--accent)]"
        />
        <button
          type="button"
          onClick={() => void admin.join()}
          disabled={admin.joining || !admin.joinCodeInput.trim()}
          className="rounded-full bg-[var(--accent)] py-3 text-sm font-semibold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
        >
          {admin.joining ? "参加中..." : "参加する"}
        </button>
      </section>
    </>
  );
}
