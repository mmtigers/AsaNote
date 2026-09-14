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

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function formatDate(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

function outcomeBadge(record: LocalRecord): { label: string; tone: "ok" | "handoff" } | null {
  if (record.handoff && record.handoff !== "なし") {
    return { label: `${record.handoff}に引き渡し`, tone: "handoff" };
  }
  if (record.companion) {
    return { label: `${record.companion}登校`, tone: "ok" };
  }
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
            const badge = outcomeBadge(record);
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
                  <span className="text-sm font-bold">{formatDate(record.recordDate)}</span>
                  {record.wakeTime && (
                    <span className="text-xs tabular-nums text-[var(--sub)]">
                      {record.wakeTime}起床
                    </span>
                  )}
                  {!own && <PartnerAvatar email={emailMap.get(record.userId ?? "")} />}
                  {badge && (
                    <span
                      className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        badge.tone === "handoff"
                          ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                          : "bg-[var(--accent-soft)] text-[var(--accent)]"
                      }`}
                    >
                      {badge.label}
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
