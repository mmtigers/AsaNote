"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { matchesChildFilter } from "@note/core/childFilter";
import { ChildSwitcher } from "@note/core/components/ChildSwitcher";
import { ConfirmDialog } from "@note/core/components/ConfirmDialog";
import { Skeleton } from "@note/core/components/Skeleton";
import { OUTCOME_OPTIONS } from "@/constants/choices";
import { OUTCOME_SOFT_STYLES } from "@/constants/outcomeStyles";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDateShort } from "@note/core/date";
import { useChildren } from "@/lib/db/children";
import type { LocalRecord } from "@/lib/db/localDb";
import { canEditRecord } from "@note/core/ownership";
import { useRecordPhotos } from "@/lib/db/photos";
import { useRecordsTimeline } from "@/lib/db/queries";
import { deleteRecord } from "@/lib/db/records";
import { useGroupMembers, buildMemberEmailMap } from "@note/core/db/groups";
import { PartnerAvatar } from "@note/core/components/PartnerAvatar";
import { RecordFeedback, RecordFeedbackActions, RecordFeedbackBody } from "@note/core/components/RecordFeedback";
import { useRecordFeedback, type RecordFeedbackState } from "@note/core/useRecordFeedback";
import { buildRecordPreview } from "@/lib/recordPreview";

// 「読んだ」印とコメントの表(定義は supabase/schema.sql)。useRecordFeedback の依存になるのでモジュールレベルに置く。
const FEEDBACK_TABLES = { reads: "evening_record_reads", comments: "evening_record_comments" } as const;

interface RecordCardProps {
  record: LocalRecord;
  childName: string | null;
  ownerLabel: string | null;
  // パートナーの記録のときだけ渡す(undefined なら自分の記録)。メール未取得は null。
  partnerEmail?: string | null;
  editable: boolean;
  onDelete: () => void;
  currentUserId: string | null;
  memberEmails: Map<string, string | null>;
  feedback: RecordFeedbackState;
}

function RecordCard({
  record,
  childName,
  ownerLabel,
  partnerEmail,
  editable,
  onDelete,
  currentUserId,
  memberEmails,
  feedback,
}: RecordCardProps) {
  const photos = useRecordPhotos(record.id);
  const outcome = OUTCOME_OPTIONS.find((o) => o.value === record.outcome);
  const preview = buildRecordPreview({ ...record, photoCount: photos?.length ?? 0 });
  const editHref = `/?date=${record.recordDate}${record.childId ? `&childId=${record.childId}` : ""}`;

  return (
    <li className={`rounded-2xl border border-[var(--line)] p-3.5 ${record.outcome ? OUTCOME_SOFT_STYLES[record.outcome] : "bg-[var(--surface)]"}`}>
      {/* 「読んだ」とコメントはサーバー上の記録に付くので、同期が済んだ記録にだけ出す。 */}
      <RecordFeedback
        disabled={record.syncStatus !== "synced"}
        recordId={record.id}
        currentUserId={currentUserId}
        ownerUserId={record.userId}
        memberEmails={memberEmails}
        reads={feedback.reads.filter((r) => r.recordId === record.id)}
        comments={feedback.comments.filter((c) => c.recordId === record.id)}
        onMarkRead={() => feedback.markRead(record.id)}
        onSaveComment={(body) => feedback.saveComment(record.id, body)}
        onDeleteComment={() => feedback.deleteComment(record.id)}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold">
            {formatDateShort(record.recordDate)} {outcome?.emoji} {outcome?.label}
          </p>
          <div className="flex items-center gap-2">
            <p className="flex items-center gap-1.5 text-[11px] text-[var(--sub)]">
              {[childName, ownerLabel].filter(Boolean).join(" ・ ")}
              {partnerEmail !== undefined && <PartnerAvatar email={partnerEmail} />}
            </p>
            <RecordFeedbackActions />
          </div>
        </div>
        {preview && <p className="mt-1.5 text-[13px] leading-relaxed">{preview}</p>}
        {editable && (
          <div className="mt-2 flex gap-3 text-xs">
            <Link href={editHref} className="font-semibold text-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]">
              ✏️ 編集
            </Link>
            <button type="button" onClick={onDelete} className="text-[var(--sub)] underline underline-offset-2 focus:ring-2 focus:ring-[var(--accent)]">
              削除
            </button>
          </div>
        )}
        <RecordFeedbackBody />
      </RecordFeedback>
    </li>
  );
}

export default function TimelinePage() {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user.id ?? null;
  const records = useRecordsTimeline();
  const children = useChildren();
  const members = useGroupMembers();
  const feedback = useRecordFeedback(FEEDBACK_TABLES);
  const [filterChildId, setFilterChildId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LocalRecord | null>(null);

  const childList = useMemo(() => children ?? [], [children]);
  const childNames = useMemo(() => new Map(childList.map((c) => [c.id, c.name])), [childList]);
  const memberEmails = useMemo(() => buildMemberEmailMap(members), [members]);
  // 未分類の記録があるときだけ「未分類」の絞り込みを出す(#127)。
  const hasUnassigned = useMemo(() => (records ?? []).some((r) => !r.childId), [records]);
  const visible = useMemo(
    () => (records ?? []).filter((r) => matchesChildFilter(r.childId, filterChildId)),
    [records, filterChildId]
  );

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">これまでの記録</h1>
        <Link href="/export" className="text-xs font-semibold text-[var(--accent)] underline underline-offset-2">
          エクスポート
        </Link>
      </div>

      {childList.length >= 2 && (
        <ChildSwitcher childList={childList} selectedId={filterChildId} onSelect={setFilterChildId}
          allowAll
          allowUnassigned={hasUnassigned}
        />
      )}

      {records === undefined || authLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-[var(--sub)]">まだ記録がありません。「記録する」から今夜のようすを残してみましょう。</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((r) => {
            const own = !r.userId || r.userId === userId;
            return (
              <RecordCard
                key={r.id}
                record={r}
                childName={r.childId ? (childNames.get(r.childId) ?? null) : null}
                ownerLabel={own ? null : "パートナー"}
                partnerEmail={own ? undefined : r.userId ? memberEmails.get(r.userId) : null}
                editable={canEditRecord(r, userId, authLoading)}
                onDelete={() => setPendingDelete(r)}
                currentUserId={userId}
                memberEmails={memberEmails}
                feedback={feedback}
              />
            );
          })}
        </ul>
      )}

      {feedback.error && (
        <p role="alert" className="text-center text-[13px] font-semibold text-[var(--accent)]">
          {feedback.error}
        </p>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        message="この記録を削除します。写真も一緒に消えます。よろしいですか？"
        confirmLabel="削除する"
        cancelLabel="やめる"
        onConfirm={async () => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) await deleteRecord(target.id);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </main>
  );
}
