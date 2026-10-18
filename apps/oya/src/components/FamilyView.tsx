"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ConfirmDialog } from "@note/core/components/ConfirmDialog";
import {
  createInvite,
  deleteInvite,
  fetchActiveInvites,
  fetchFamilyMembers,
  removeMember,
  ROLE_LABELS,
  setMemberRole,
  type Invite,
  type Member,
  type Role,
} from "@/lib/db/family";
import { describeServerError } from "@/lib/errors";

const ROLES: Role[] = ["parent", "admin", "viewer"];

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

type Pending = { kind: "remove"; member: Member } | { kind: "leave" } | null;

/**
 * 家族のメンバーと招待。家族管理者は招待コードの発行・取り消し、役割の変更、メンバーを外す操作ができる。
 * それ以外の人は、メンバーの一覧と「家族から抜ける」だけ。
 * ボタンの出し分けは表示のためだけで、権限の検証はサーバー(RLS と DB の関数)が行う。
 */
export function FamilyView({ me, onChanged }: { me: Member; onChanged: () => Promise<void> }) {
  const router = useRouter();
  const isAdmin = me.role === "admin";
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [newRole, setNewRole] = useState<Role>("parent");
  const [newName, setNewName] = useState("");
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [nextMembers, nextInvites] = await Promise.all([fetchFamilyMembers(), isAdmin ? fetchActiveInvites() : Promise.resolve([])]);
    setMembers(nextMembers);
    setInvites(nextInvites);
  }, [isAdmin]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- サーバー(外部)のデータを開いた時に読み込む
    reload().catch((error) => setErrorMessage(describeServerError(error, "家族の情報を読み込めませんでした。")));
  }, [reload]);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setErrorMessage(null);
    try {
      await action();
      await reload();
    } catch (error) {
      setErrorMessage(describeServerError(error, fallback));
    } finally {
      setBusy(false);
    }
  }

  function onIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      setIssuedCode(await createInvite(newRole, newName));
      setNewName("");
    }, "招待コードを発行できませんでした。もう一度お試しください。");
  }

  async function confirmPending() {
    const target = pending;
    setPending(null);
    if (!target) return;
    if (target.kind === "remove") {
      await run(() => removeMember(target.member.userId), "メンバーを外せませんでした。もう一度お試しください。");
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      await removeMember(me.userId);
      await onChanged();
      router.replace("/");
    } catch (error) {
      setErrorMessage(describeServerError(error, "家族から抜けられませんでした。もう一度お試しください。"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {errorMessage && <p role="alert" className="text-base text-[var(--holiday)]">{errorMessage}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">メンバー</h2>
        {members === null ? (
          <p className="text-base text-[var(--sub)]">読み込み中...</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {members.map((member) => {
              const isMe = member.userId === me.userId;
              return (
                <li key={member.userId} className="flex flex-col gap-2 rounded-2xl bg-[var(--surface)] p-4">
                  <p className="text-lg">
                    <span className="font-bold">{member.displayName}</span>
                    {isMe && <span className="ml-2 text-sm text-[var(--sub)]">(あなた)</span>}
                  </p>
                  {isAdmin && !isMe ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <select
                        aria-label={`${member.displayName}さんの役割`}
                        value={member.role}
                        disabled={busy}
                        onChange={(event) =>
                          void run(() => setMemberRole(member.userId, event.target.value as Role), "役割を変えられませんでした。もう一度お試しください。")
                        }
                        className="min-h-12 rounded-xl bg-[var(--surface-2)] px-3 text-base"
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setPending({ kind: "remove", member })}
                        className="text-base text-[var(--holiday)] underline underline-offset-2 disabled:opacity-60"
                      >
                        家族から外す
                      </button>
                    </div>
                  ) : (
                    <p className="text-base text-[var(--sub)]">{ROLE_LABELS[member.role]}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {isAdmin && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">招待する</h2>
          <form onSubmit={onIssue} className="flex flex-col gap-3 rounded-2xl bg-[var(--surface)] p-4">
            <label className="flex flex-col gap-1 text-base">
              役割
              <select
                value={newRole}
                onChange={(event) => setNewRole(event.target.value as Role)}
                className="min-h-12 rounded-xl bg-[var(--surface-2)] px-3 text-base"
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-base">
              呼び名(例: 父、母、長女)
              <input
                type="text"
                required
                maxLength={20}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                className="min-h-12 rounded-xl bg-[var(--surface-2)] px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="min-h-12 rounded-full bg-[var(--accent)] py-4 text-lg font-bold text-[var(--accent-ink)] disabled:opacity-60"
            >
              招待コードを発行する
            </button>
          </form>

          {issuedCode && (
            <div className="rounded-2xl bg-[var(--accent-soft)] p-4 text-center" aria-live="polite">
              <p className="text-base">招待コード(24時間有効・1回だけ使えます)</p>
              <p className="mt-2 font-mono text-3xl font-bold tracking-[0.2em]">{issuedCode}</p>
              <p className="mt-2 text-sm text-[var(--sub)]">招待する人に伝え、おやノートにログインしてから入力してもらってください。</p>
            </div>
          )}

          {invites.length > 0 && (
            <ul className="flex flex-col gap-2">
              {invites.map((invite) => (
                <li key={invite.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--surface)] p-4">
                  <span className="text-base">
                    <span className="font-mono font-bold tracking-widest">{invite.code}</span>
                    <span className="block text-sm text-[var(--sub)]">
                      {invite.displayName}({ROLE_LABELS[invite.role]})・{formatExpiry(invite.expiresAt)}まで
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => deleteInvite(invite.id), "招待コードを取り消せませんでした。もう一度お試しください。")}
                    className="shrink-0 text-base text-[var(--holiday)] underline underline-offset-2 disabled:opacity-60"
                  >
                    取り消す
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => setPending({ kind: "leave" })}
          className="self-start text-base text-[var(--holiday)] underline underline-offset-2 disabled:opacity-60"
        >
          家族から抜ける
        </button>
        <Link href="/" className="self-start text-base text-[var(--accent)] underline underline-offset-2">
          ← ホームに戻る
        </Link>
      </section>

      <ConfirmDialog
        open={pending !== null}
        message={
          pending?.kind === "remove"
            ? `${pending.member.displayName}さんを家族から外しますか?これまでの記録は家族に残ります。`
            : "家族から抜けますか?もう一度参加するには、新しい招待コードが必要です。"
        }
        confirmLabel={pending?.kind === "remove" ? "外す" : "抜ける"}
        onConfirm={() => void confirmPending()}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
