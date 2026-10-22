"use client";

import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { COMMENT_MAX_LENGTH, type RecordComment, type RecordRead } from "../recordFeedback";

export interface RecordFeedbackProps {
  recordId: string;
  currentUserId: string | null | undefined;
  /** 記録した人。未設定(クラウド未同期の自分の記録)は自分として扱う。 */
  ownerUserId: string | null | undefined;
  /** グループのメンバー(userId → メールアドレス)。表示名と、相手が誰かの判定に使う。 */
  memberEmails: Map<string, string | null>;
  /** この記録の分だけに絞った「読んだ」とコメント。 */
  reads: RecordRead[];
  comments: RecordComment[];
  onMarkRead: () => Promise<void>;
  onSaveComment: (body: string) => Promise<boolean>;
  onDeleteComment: () => Promise<boolean>;
}

function displayName(email: string | null | undefined): string {
  const name = (email ?? "").split("@")[0]?.trim();
  return name ? `${name}さん` : "パートナー";
}

// "10/22 8:30"。端末のタイムゾーンで表示する。
export function formatReadAt(iso: string): string {
  const d = new Date(iso);
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${minutes}`;
}

// タイムラインの記録カードに付ける「読んだ」ボタンとひとことコメント。
// 「読んだ」は自分の記録にも押せる(読む側が未読/既読を見分けるため)。
// コメントは1つの記録に1人1件で、書いた本人だけが編集・削除できる。
export function RecordFeedback({
  recordId,
  currentUserId,
  ownerUserId,
  memberEmails,
  reads,
  comments,
  onMarkRead,
  onSaveComment,
  onDeleteComment,
}: RecordFeedbackProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const myRead = reads.find((r) => r.userId === currentUserId);
  const othersRead = reads.filter((r) => r.userId !== currentUserId);
  const myComment = comments.find((c) => c.userId === currentUserId);
  const otherComments = comments.filter((c) => c.userId !== currentUserId);
  const isOwner = !ownerUserId || ownerUserId === currentUserId;
  const hasPartner = [...memberEmails.keys()].some((id) => id !== currentUserId);
  const nameOf = (userId: string) => displayName(memberEmails.get(userId));

  async function run(action: () => Promise<boolean | void>): Promise<boolean> {
    setBusy(true);
    try {
      return (await action()) !== false;
    } finally {
      setBusy(false);
    }
  }

  function startEditing() {
    setDraft(myComment?.body ?? "");
    setEditing(true);
  }

  async function handleSave() {
    if (await run(() => onSaveComment(draft))) setEditing(false);
  }

  async function handleConfirmDelete() {
    setConfirmingDelete(false);
    await run(onDeleteComment);
  }

  const trimmedLength = draft.trim().length;

  return (
    <div data-record-id={recordId} className="mt-2.5 flex flex-col gap-2 border-t border-[var(--line)] pt-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px]">
        {myRead ? (
          <span className="whitespace-nowrap font-semibold text-[var(--calm)]">
            ✓ 読みました {formatReadAt(myRead.readAt)}
          </span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(onMarkRead)}
            className="whitespace-nowrap rounded-full bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-[var(--accent-ink)] disabled:opacity-60"
          >
            読んだ
          </button>
        )}
        {othersRead.map((r) => (
          <span key={r.userId} className="whitespace-nowrap text-[var(--sub)]">
            ✓ {nameOf(r.userId)}が読みました {formatReadAt(r.readAt)}
          </span>
        ))}
        {isOwner && hasPartner && othersRead.length === 0 && (
          <span className="whitespace-nowrap text-[var(--sub)]">まだ読まれていません</span>
        )}
      </div>

      {otherComments.map((c) => (
        <p key={c.userId} className="rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5 text-[13px] leading-relaxed">
          <span className="font-semibold text-[var(--sub)]">{nameOf(c.userId)}: </span>
          {c.body}
        </p>
      ))}

      {editing ? (
        <div className="flex flex-col gap-1.5">
          <input
            type="text"
            value={draft}
            maxLength={COMMENT_MAX_LENGTH}
            autoFocus
            aria-label="コメント"
            placeholder="ひとことコメント"
            onChange={(event) => setDraft(event.target.value)}
            className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[13px] outline-none"
          />
          <div className="flex items-center justify-end gap-2 text-[12px]">
            <span className="mr-auto tabular-nums text-[var(--sub)]">
              {trimmedLength}/{COMMENT_MAX_LENGTH}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(false)}
              className="rounded-full bg-[var(--surface-2)] px-3 py-1.5 font-semibold text-[var(--sub)]"
            >
              キャンセル
            </button>
            <button
              type="button"
              disabled={busy || trimmedLength === 0}
              onClick={() => void handleSave()}
              className="rounded-full bg-[var(--accent)] px-3 py-1.5 font-semibold text-[var(--accent-ink)] disabled:opacity-60"
            >
              保存
            </button>
          </div>
        </div>
      ) : myComment ? (
        <div className="flex items-start gap-2 rounded-lg bg-[var(--accent-soft)] px-2.5 py-1.5 text-[13px] leading-relaxed">
          <p className="min-w-0 flex-1 break-words">
            <span className="font-semibold text-[var(--accent)]">自分: </span>
            {myComment.body}
          </p>
          <div className="flex flex-none items-center gap-1 text-[12px]">
            <button
              type="button"
              disabled={busy}
              onClick={startEditing}
              aria-label="コメントを編集する"
              className="rounded-full px-1.5 py-0.5 text-[var(--sub)]"
            >
              ✏️
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmingDelete(true)}
              aria-label="コメントを削除する"
              className="rounded-full px-1.5 py-0.5 text-[var(--sub)]"
            >
              🗑
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={startEditing}
          className="self-start rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-[12px] font-semibold text-[var(--sub)]"
        >
          💬 コメントする
        </button>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        message="このコメントを削除しますか？"
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
