"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
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
  /** true の間は何も出さない(サーバーに無い記録など)。 */
  disabled?: boolean;
  children: ReactNode;
}

interface FeedbackModel extends Omit<RecordFeedbackProps, "disabled" | "children"> {
  editing: boolean;
  draft: string;
  busy: boolean;
  confirmingDelete: boolean;
  setDraft: (value: string) => void;
  setEditing: (value: boolean) => void;
  setConfirmingDelete: (value: boolean) => void;
  run: (action: () => Promise<boolean | void>) => Promise<boolean>;
  startEditing: () => void;
}

const FeedbackContext = createContext<FeedbackModel | null>(null);

function displayName(email: string | null | undefined): string {
  const name = (email ?? "").split("@")[0]?.trim();
  return name ? `${name}さん` : "パートナー";
}

// タイムラインの記録カードに付ける「読んだ」とひとことコメント。
// ボタン(RecordFeedbackActions)はカードの右上、パートナーの既読表示とコメント(RecordFeedbackBody)は
// カードの下に置くので、状態はこの Provider が持ち、2つの部品がそれを読む。
// 「読んだ」は自分の記録にも押せる(読む側が未読/既読を見分けるため)。
// コメントは1つの記録に1人1件で、書いた本人だけが編集・削除できる。
export function RecordFeedback({ disabled, children, ...props }: RecordFeedbackProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (disabled) return <>{children}</>;

  const myComment = props.comments.find((c) => c.userId === props.currentUserId);

  async function run(action: () => Promise<boolean | void>): Promise<boolean> {
    setBusy(true);
    try {
      return (await action()) !== false;
    } finally {
      setBusy(false);
    }
  }

  const model: FeedbackModel = {
    ...props,
    editing,
    draft,
    busy,
    confirmingDelete,
    setDraft,
    setEditing,
    setConfirmingDelete,
    run,
    startEditing: () => {
      setDraft(myComment?.body ?? "");
      setEditing(true);
    },
  };
  return <FeedbackContext.Provider value={model}>{children}</FeedbackContext.Provider>;
}

// 右上に並べる、「読んだ」(✅)と「コメントする」(💬)のボタン。
// ✅ は、未読ならうすい色で押せる、既読なら濃い色(押せない)。日時は出さない。
export function RecordFeedbackActions() {
  const model = useContext(FeedbackContext);
  if (!model) return null;
  const { reads, currentUserId, busy, run, onMarkRead, startEditing, editing } = model;
  const myRead = reads.some((r) => r.userId === currentUserId);

  return (
    <>
      {myRead ? (
        <span role="img" aria-label="読みました" className="-my-1 px-2 py-1 text-base leading-none">
          ✅
        </span>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(onMarkRead)}
          aria-label="読んだ"
          className="-my-1 rounded-full px-2 py-1 text-base leading-none opacity-40 grayscale disabled:opacity-20"
        >
          ✅
        </button>
      )}
      <button
        type="button"
        disabled={busy || editing}
        onClick={startEditing}
        aria-label="コメントする"
        className="-my-1 rounded-full px-2 py-1 text-base leading-none disabled:opacity-40"
      >
        💬
      </button>
    </>
  );
}

// カードの下に出す、パートナーの既読表示とコメント(と、その入力欄)。
export function RecordFeedbackBody() {
  const model = useContext(FeedbackContext);
  if (!model) return null;
  const {
    currentUserId,
    ownerUserId,
    memberEmails,
    reads,
    comments,
    editing,
    draft,
    busy,
    confirmingDelete,
    setDraft,
    setEditing,
    setConfirmingDelete,
    run,
    startEditing,
    onSaveComment,
    onDeleteComment,
  } = model;

  const othersRead = reads.filter((r) => r.userId !== currentUserId);
  const myComment = comments.find((c) => c.userId === currentUserId);
  const otherComments = comments.filter((c) => c.userId !== currentUserId);
  const isOwner = !ownerUserId || ownerUserId === currentUserId;
  const hasPartner = [...memberEmails.keys()].some((id) => id !== currentUserId);
  const nameOf = (userId: string) => displayName(memberEmails.get(userId));
  const showUnreadHint = isOwner && hasPartner && othersRead.length === 0;
  const trimmedLength = draft.trim().length;

  async function handleSave() {
    if (await run(() => onSaveComment(draft))) setEditing(false);
  }

  async function handleConfirmDelete() {
    setConfirmingDelete(false);
    await run(onDeleteComment);
  }

  const hasContent = othersRead.length > 0 || showUnreadHint || otherComments.length > 0 || !!myComment || editing;

  return (
    <>
      {hasContent && (
        <div className="mt-2.5 flex flex-col gap-2 border-t border-[var(--line)] pt-2.5">
          {(othersRead.length > 0 || showUnreadHint) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--sub)]">
              {othersRead.map((r) => (
                <span key={r.userId} className="whitespace-nowrap">
                  ✅ {nameOf(r.userId)}が読みました
                </span>
              ))}
              {showUnreadHint && <span className="whitespace-nowrap">まだ読まれていません</span>}
            </div>
          )}

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
          ) : (
            myComment && (
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
            )
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        message="このコメントを削除しますか？"
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  );
}
