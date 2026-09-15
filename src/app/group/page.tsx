"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Skeleton } from "@/components/Skeleton";
import { useAuth } from "@/lib/auth/AuthProvider";
import { createChild, getChildren } from "@/lib/db/children";
import {
  createGroup,
  createInvite,
  getActiveInvite,
  getGroupMembers,
  getMyGroup,
  joinGroupByCode,
  leaveGroup,
} from "@/lib/db/groups";
import { pullFromCloud } from "@/lib/db/sync";
import type { Child, Group, GroupInvite, GroupMemberProfile } from "@/types/models";
import { runAction, runSilently } from "./runAction";

const SHARE_COPIED_VISIBLE_MS = 2000;

export default function GroupPage() {
  const { session, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMemberProfile[]>([]);
  const [invite, setInvite] = useState<GroupInvite | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [joining, setJoining] = useState(false);
  const [issuingInvite, setIssuingInvite] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [childNameInput, setChildNameInput] = useState("");
  const [addingChild, setAddingChild] = useState(false);

  const refresh = useCallback(async () => {
    const myGroup = await getMyGroup();
    setGroup(myGroup);
    if (myGroup) {
      const [memberList, activeInvite] = await Promise.all([
        getGroupMembers(),
        getActiveInvite(myGroup.id),
      ]);
      setMembers(memberList);
      setInvite(activeInvite);
    } else {
      setMembers([]);
      setInvite(null);
    }
    setChildren(await getChildren());
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 未ログイン確定後に一度だけローディング表示を止める後始末で、フェッチ自体は発生しない
      setLoading(false);
      return;
    }
    runAction(refresh, "共有設定の取得に失敗しました", setErrorMessage).finally(() => setLoading(false));
  }, [authLoading, session, refresh]);

  useEffect(() => {
    if (!shareCopied) return;
    const timer = setTimeout(() => setShareCopied(false), SHARE_COPIED_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [shareCopied]);

  async function handleCreateGroup() {
    if (creating) return;
    setErrorMessage(null);
    setCreating(true);

    const created = await runAction(createGroup, "グループの作成に失敗しました", setErrorMessage);
    if (!created.ok) {
      setCreating(false);
      return;
    }
    const newGroup = created.value;
    setGroup(newGroup);

    await runSilently(async () => setMembers(await getGroupMembers()));
    await runAction(
      async () => setInvite(await createInvite(newGroup.id)),
      "グループを作成しましたが、招待コードの発行に失敗しました。下のボタンから発行し直してください",
      setErrorMessage
    );
    setCreating(false);
  }

  async function handleJoinGroup() {
    setErrorMessage(null);
    setJoining(true);

    const joined = await runAction(
      async () => {
        await joinGroupByCode(joinCodeInput);
        setJoinCodeInput("");
      },
      "参加に失敗しました",
      setErrorMessage
    );
    if (!joined.ok) {
      setJoining(false);
      return;
    }

    await runSilently(async () => {
      await refresh();
      void pullFromCloud();
    });
    setJoining(false);
  }

  async function handleIssueInvite() {
    if (!group) return;
    setErrorMessage(null);
    setIssuingInvite(true);
    await runAction(async () => setInvite(await createInvite(group.id)), "招待コードの発行に失敗しました", setErrorMessage);
    setIssuingInvite(false);
  }

  async function handleShareInvite() {
    if (!invite) return;
    const text = `あさノートのグループに招待します。招待コード: ${invite.code}\n(24時間以内に入力してください)`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "あさノート グループ招待", text });
      } catch (error) {
        if ((error as DOMException).name !== "AbortError") console.error(error);
      }
      return;
    }

    await navigator.clipboard.writeText(text);
    setShareCopied(true);
  }

  async function handleAddChild() {
    setErrorMessage(null);
    setAddingChild(true);
    const created = await runAction(
      () => createChild(childNameInput),
      "お子さまの追加に失敗しました",
      setErrorMessage
    );
    if (created.ok) {
      setChildren((prev) => [...prev, created.value]);
      setChildNameInput("");
    }
    setAddingChild(false);
  }

  async function handleConfirmLeave() {
    setConfirmingLeave(false);
    setLeaving(true);
    setErrorMessage(null);
    await runAction(
      async () => {
        await leaveGroup();
        setGroup(null);
        setMembers([]);
        setInvite(null);
        void pullFromCloud();
      },
      "グループを抜ける処理に失敗しました",
      setErrorMessage
    );
    setLeaving(false);
  }

  if (authLoading || loading) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-6 px-4 pt-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-8">
        <h1 className="text-lg font-bold">家族との共有</h1>
        <p className="text-sm text-[var(--sub)]">記録を共有するにはログインが必要です。</p>
        <Link
          href="/login"
          className="rounded-full bg-[var(--accent)] py-3 text-center text-sm font-semibold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent)]"
        >
          ログインする
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 pt-6">
      <header>
        <h1 className="text-lg font-bold">家族との共有</h1>
        <p className="mt-1 text-xs text-[var(--sub)]">
          夫婦・家族単位で記録を共有できます。グループに入ると、どちらが記録しても両方のスマホから見えるようになります。
        </p>
      </header>

      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMessage}</p>
      )}

      <section className="flex flex-col gap-3 rounded-2xl bg-[var(--surface-2)] p-4">
        <h2 className="text-sm font-semibold text-[var(--sub)]">お子さま</h2>
        <p className="text-xs text-[var(--sub)]">
          2人以上登録すると、記録・タイムライン・傾向で子どもごとに切り替えられるようになります。
        </p>
        {children.length > 0 && (
          <ul className="flex flex-col gap-2">
            {children.map((child) => (
              <li key={child.id} className="rounded-xl bg-[var(--surface)] px-4 py-3 text-sm">
                {child.name}
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            value={childNameInput}
            onChange={(event) => setChildNameInput(event.target.value)}
            placeholder="お子さまの名前"
            maxLength={50}
            className="flex-1 rounded-xl bg-[var(--surface)] px-4 py-3 text-base outline-none placeholder:text-[var(--sub)] focus:ring-2 focus:ring-[var(--accent)]"
          />
          <button
            type="button"
            onClick={handleAddChild}
            disabled={addingChild || !childNameInput.trim()}
            className="flex-none rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
          >
            {addingChild ? "追加中..." : "＋追加"}
          </button>
        </div>
      </section>

      {!group ? (
        <>
          <section className="flex flex-col gap-3 rounded-2xl bg-[var(--surface-2)] p-4">
            <h2 className="text-sm font-semibold text-[var(--sub)]">グループを作る</h2>
            <p className="text-xs text-[var(--sub)]">
              作成すると、あなたの記録が今後グループメンバーと自動的に共有されます。
            </p>
            <button
              type="button"
              onClick={handleCreateGroup}
              disabled={creating}
              className="rounded-full bg-[var(--accent)] py-3 text-sm font-semibold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
            >
              {creating ? "作成中..." : "グループを作る"}
            </button>
          </section>

          <section className="flex flex-col gap-3 rounded-2xl bg-[var(--surface-2)] p-4">
            <h2 className="text-sm font-semibold text-[var(--sub)]">招待コードを持っている</h2>
            <input
              value={joinCodeInput}
              onChange={(event) => setJoinCodeInput(event.target.value)}
              placeholder="招待コードを入力"
              maxLength={16}
              className="rounded-xl bg-[var(--surface)] px-4 py-3 text-base tracking-widest outline-none placeholder:text-[var(--sub)] placeholder:tracking-normal focus:ring-2 focus:ring-[var(--accent)]"
            />
            <button
              type="button"
              onClick={handleJoinGroup}
              disabled={joining || !joinCodeInput.trim()}
              className="rounded-full bg-[var(--accent)] py-3 text-sm font-semibold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
            >
              {joining ? "参加中..." : "参加する"}
            </button>
          </section>
        </>
      ) : (
        <>
          <section className="flex flex-col gap-3 rounded-2xl bg-[var(--surface-2)] p-4">
            <h2 className="text-sm font-semibold text-[var(--sub)]">メンバー</h2>
            <ul className="flex flex-col gap-2">
              {members.map((member) => (
                <li
                  key={member.user_id}
                  className="flex items-center justify-between rounded-xl bg-[var(--surface)] px-4 py-3 text-sm"
                >
                  <span>{member.email ?? "メンバー"}</span>
                  {member.user_id === session.user.id && (
                    <span className="text-xs text-[var(--accent)]">あなた</span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-3 rounded-2xl bg-[var(--surface-2)] p-4">
            <h2 className="text-sm font-semibold text-[var(--sub)]">招待コード</h2>
            {invite ? (
              <>
                <p className="text-center text-2xl font-bold tracking-[0.3em]">{invite.code}</p>
                <p className="text-xs text-[var(--sub)]">
                  24時間以内に入力すると参加できます(1回のみ使用可)。
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleShareInvite}
                    className="flex-1 rounded-full bg-[var(--accent)] py-3 text-sm font-semibold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent)]"
                  >
                    共有する
                  </button>
                  <button
                    type="button"
                    onClick={handleIssueInvite}
                    disabled={issuingInvite}
                    className="flex-1 rounded-full bg-[var(--surface)] border border-[var(--line)] py-3 text-sm font-semibold text-[var(--ink)] focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
                  >
                    {issuingInvite ? "発行中..." : "新しく発行する"}
                  </button>
                </div>
                {shareCopied && (
                  <span className="text-center text-xs text-[var(--accent)]">コピーしました</span>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={handleIssueInvite}
                disabled={issuingInvite}
                className="rounded-full bg-[var(--accent)] py-3 text-sm font-semibold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
              >
                {issuingInvite ? "発行中..." : "招待コードを発行する"}
              </button>
            )}
          </section>

          <button
            type="button"
            onClick={() => setConfirmingLeave(true)}
            disabled={leaving}
            className="rounded-full bg-[var(--surface-2)] py-3 text-sm font-semibold text-red-600 focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
          >
            {leaving ? "処理中..." : "グループを抜ける"}
          </button>
        </>
      )}

      <ConfirmDialog
        open={confirmingLeave}
        message="グループを抜けますか？実行後は相手の記録がすぐに見えなくなります。この操作は取り消せません。"
        confirmLabel="抜ける"
        onConfirm={handleConfirmLeave}
        onCancel={() => setConfirmingLeave(false)}
      />
    </main>
  );
}
