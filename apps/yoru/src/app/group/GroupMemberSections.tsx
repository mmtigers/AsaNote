"use client";

import { ConfirmDialog } from "@note/core/components/ConfirmDialog";
import type { GroupAdmin } from "./useGroupAdmin";

// グループに属しているときの表示(メンバー・招待コード・脱退)(#62)。
export function GroupMemberSections({
  admin,
  currentUserId,
}: {
  admin: GroupAdmin;
  currentUserId: string;
}) {
  return (
    <>
      <section className="flex flex-col gap-3 rounded-2xl bg-[var(--surface-2)] p-4">
        <h2 className="text-sm font-semibold text-[var(--sub)]">メンバー</h2>
        <ul className="flex flex-col gap-2">
          {admin.members.map((member) => (
            <li
              key={member.user_id}
              className="flex items-center justify-between rounded-xl bg-[var(--surface)] px-4 py-3 text-sm"
            >
              <span>{member.email ?? "メンバー"}</span>
              {member.user_id === currentUserId && (
                <span className="text-xs text-[var(--accent)]">あなた</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-[var(--surface-2)] p-4">
        <h2 className="text-sm font-semibold text-[var(--sub)]">招待コード</h2>
        {admin.invite ? (
          <>
            <p className="text-center text-2xl font-bold tracking-[0.3em]">{admin.invite.code}</p>
            <p className="text-xs text-[var(--sub)]">
              24時間以内に入力すると参加できます(1回のみ使用可)。
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void admin.shareInvite()}
                className="flex-1 rounded-full bg-[var(--accent)] py-3 text-sm font-semibold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent)]"
              >
                共有する
              </button>
              <button
                type="button"
                onClick={() => void admin.issueInvite()}
                disabled={admin.issuingInvite}
                className="flex-1 rounded-full bg-[var(--surface)] border border-[var(--line)] py-3 text-sm font-semibold text-[var(--ink)] focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
              >
                {admin.issuingInvite ? "発行中..." : "新しく発行する"}
              </button>
            </div>
            {admin.shareCopied && (
              <span className="text-center text-xs text-[var(--accent)]">コピーしました</span>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => void admin.issueInvite()}
            disabled={admin.issuingInvite}
            className="rounded-full bg-[var(--accent)] py-3 text-sm font-semibold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
          >
            {admin.issuingInvite ? "発行中..." : "招待コードを発行する"}
          </button>
        )}
      </section>

      <button
        type="button"
        onClick={admin.requestLeave}
        disabled={admin.leaving}
        className="rounded-full bg-[var(--surface-2)] py-3 text-sm font-semibold text-red-600 focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
      >
        {admin.leaving ? "処理中..." : "グループを抜ける"}
      </button>

      <ConfirmDialog
        open={admin.confirmingLeave}
        message="グループを抜けますか？実行後は相手の記録がすぐに見えなくなります。この操作は取り消せません。"
        confirmLabel="抜ける"
        onConfirm={() => void admin.confirmLeave()}
        onCancel={admin.cancelLeave}
      />
    </>
  );
}
