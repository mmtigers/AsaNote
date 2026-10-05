"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createGroup,
  createInvite,
  getActiveInvite,
  getGroupMembers,
  getMyGroup,
  joinGroupByCode,
  leaveGroup,
} from "@/lib/db/groups";
import type { Group, GroupInvite, GroupMemberProfile } from "@/types/models";
import { runAction, runSilently } from "./runAction";

const SHARE_COPIED_VISIBLE_MS = 2000;

// 共有設定画面のグループまわりの状態と操作(#62)。
// 画面(page.tsx)は表示の組み立てだけを持ち、作成・参加・招待・脱退の手順はここに閉じる。
export interface GroupAdmin {
  group: Group | null;
  members: GroupMemberProfile[];
  invite: GroupInvite | null;
  creating: boolean;
  joinCodeInput: string;
  setJoinCodeInput: (value: string) => void;
  joining: boolean;
  issuingInvite: boolean;
  /** コピー完了の表示。数秒で自動的に消える。 */
  shareCopied: boolean;
  leaving: boolean;
  confirmingLeave: boolean;
  refresh: () => Promise<void>;
  create: () => Promise<void>;
  join: () => Promise<void>;
  issueInvite: () => Promise<void>;
  shareInvite: () => Promise<void>;
  requestLeave: () => void;
  cancelLeave: () => void;
  confirmLeave: () => Promise<void>;
}

export function useGroupAdmin({
  onError,
  onJoined,
}: {
  onError: (message: string | null) => void;
  /** 参加直後に呼ばれる。共有されたデータ(お子さま等)を取り直すため。 */
  onJoined: () => Promise<void>;
}): GroupAdmin {
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMemberProfile[]>([]);
  const [invite, setInvite] = useState<GroupInvite | null>(null);

  const [creating, setCreating] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [joining, setJoining] = useState(false);
  const [issuingInvite, setIssuingInvite] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

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
  }, []);

  useEffect(() => {
    if (!shareCopied) return;
    const timer = setTimeout(() => setShareCopied(false), SHARE_COPIED_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [shareCopied]);

  async function create() {
    if (creating) return;
    onError(null);
    setCreating(true);

    const created = await runAction(createGroup, "グループの作成に失敗しました", onError);
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
      onError
    );
    setCreating(false);
  }

  async function join() {
    onError(null);
    setJoining(true);

    const joined = await runAction(
      async () => {
        await joinGroupByCode(joinCodeInput);
        setJoinCodeInput("");
      },
      "参加に失敗しました",
      onError
    );
    if (!joined.ok) {
      setJoining(false);
      return;
    }

    await runSilently(async () => {
      await refresh();
      await onJoined();
    });
    setJoining(false);
  }

  async function issueInvite() {
    if (!group) return;
    onError(null);
    setIssuingInvite(true);
    await runAction(
      async () => setInvite(await createInvite(group.id)),
      "招待コードの発行に失敗しました",
      onError
    );
    setIssuingInvite(false);
  }

  async function shareInvite() {
    if (!invite) return;
    onError(null);
    const text = `よるノートのグループに招待します。招待コード: ${invite.code}\n(24時間以内に入力してください)`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "よるノート グループ招待", text });
      } catch (error) {
        if ((error as DOMException).name !== "AbortError") console.error(error);
      }
      return;
    }

    // navigator.clipboard は非セキュアコンテキスト(http)では undefined になり、
    // writeText も権限拒否やフォーカス喪失で reject しうる。上の navigator.share 側は
    // 保護済みだったがこちらは未保護で、失敗すると未処理の拒否になりユーザーには
    // 何も起きていないように見えていた。招待コードは画面に出ているので、
    // 失敗時は手動で控えてもらう案内を出す。
    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
    } catch {
      onError("招待コードをコピーできませんでした。画面のコードを手動で控えてください。");
    }
  }

  async function confirmLeave() {
    setConfirmingLeave(false);
    setLeaving(true);
    onError(null);
    await runAction(
      async () => {
        await leaveGroup();
        setGroup(null);
        setMembers([]);
        setInvite(null);
      },
      "グループを抜ける処理に失敗しました",
      onError
    );
    setLeaving(false);
  }

  return {
    group,
    members,
    invite,
    creating,
    joinCodeInput,
    setJoinCodeInput,
    joining,
    issuingInvite,
    shareCopied,
    leaving,
    confirmingLeave,
    refresh,
    create,
    join,
    issueInvite,
    shareInvite,
    requestLeave: () => setConfirmingLeave(true),
    cancelLeave: () => setConfirmingLeave(false),
    confirmLeave,
  };
}
