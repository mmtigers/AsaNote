"use client";

import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PartnerAvatar } from "@/components/PartnerAvatar";
import { SkeletonList } from "@/components/Skeleton";
import { useAuth } from "@/lib/auth/AuthProvider";
import { buildMemberEmailMap, isOwnRecord, useGroupMembers } from "@/lib/db/groups";
import { deleteRecord } from "@/lib/db/records";
import { useRecordsTimeline } from "@/lib/db/queries";
import type { LocalRecord } from "@/lib/db/localDb";
import { OUTCOME_OPTIONS } from "@/constants/choices";
import { formatDateShort } from "@/lib/date";

const OUTCOME_BADGE_STYLES = {
  accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
  amber: "bg-[var(--amber-soft)] text-[var(--amber)]",
  calm: "bg-[var(--calm-soft)] text-[var(--calm)]",
} as const;

// 旧フォーム(〜v1)の記録には引き渡し先・同行者のみ入っていることがあるため、
// その名残として表示する。新しい記録では通常つかない。
function legacyBadge(record: LocalRecord): string | null {
  if (record.handoff && record.handoff !== "なし") return `${record.handoff}に引き渡し`;
  if (record.companion) return `${record.companion}登校`;
  return null;
}

export default function TimelinePage() {
  const { session, loading: authLoading } = useAuth();
  const records = useRecordsTimeline();
  const members = useGroupMembers();
  const emailMap = buildMemberEmailMap(members);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    await deleteRecord(deleteTarget);
    setDeleteTarget(null);
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 px-4 pt-6">
      <header>
        <h1 className="text-lg font-bold">これまでの記録</h1>
        <p className="mt-1 text-xs text-[var(--sub)]">新しい順に表示しています。</p>
      </header>

      {records === undefined ? (
        <SkeletonList rows={4} />
      ) : records.length === 0 ? (
        <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-center text-sm text-[var(--sub)]">
          まだ記録がありません。「記録する」タブから入力してみましょう。
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {records.map((record) => {
            const own = isOwnRecord(record, session?.user.id, authLoading);
            const outcome = OUTCOME_OPTIONS.find((o) => o.value === record.outcome);
            const legacy = legacyBadge(record);
            const allTags = [
              ...record.wakeTags,
              ...record.triggerTags,
              ...record.reasonTags,
              ...record.responseTags,
            ];
            return (
              <li
                key={record.id}
                className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-sm font-bold">{formatDateShort(record.recordDate)}</span>
                  {record.wakeTime && (
                    <span className="text-xs tabular-nums text-[var(--sub)]">
                      {record.wakeTime}起床
                    </span>
                  )}
                  {outcome && (
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${OUTCOME_BADGE_STYLES[outcome.color]}`}
                    >
                      {outcome.emoji} {outcome.label}
                    </span>
                  )}
                  {!own && <PartnerAvatar email={emailMap.get(record.userId ?? "")} />}
                  {legacy && (
                    <span className="ml-auto rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-bold text-[var(--sub)]">
                      {legacy}
                    </span>
                  )}
                </div>
                {record.memo && (
                  <p className="mb-2 text-[13px] leading-relaxed text-[var(--ink)]">{record.memo}</p>
                )}
                {allTags.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {allTags.map((tag, i) => (
                      <span
                        key={`${tag}-${i}`}
                        className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[11px] text-[var(--sub)]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {own && (
                  <div className="flex gap-3 text-xs">
                    <Link
                      href={`/?date=${record.recordDate}`}
                      className="text-[var(--accent)] underline underline-offset-2"
                    >
                      編集する
                    </Link>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(record.id)}
                      className="text-red-600 underline underline-offset-2"
                    >
                      削除する
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        message="この記録を削除しますか？この操作は取り消せません。"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}
