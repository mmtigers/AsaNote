"use client";

import Link from "next/link";
import { useState } from "react";
import { ChildSwitcher } from "@/components/ChildSwitcher";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PartnerAvatar } from "@/components/PartnerAvatar";
import { SkeletonList } from "@/components/Skeleton";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useChildren } from "@/lib/db/children";
import { buildMemberEmailMap, useGroupMembers } from "@/lib/db/groups";
import { canEditRecord, isOwnRecord } from "@/lib/db/ownership";
import { deleteRecord } from "@/lib/db/records";
import { useRecordsTimeline } from "@/lib/db/queries";
import type { LocalRecord } from "@/lib/db/localDb";
import { OUTCOME_OPTIONS, type Outcome } from "@/constants/choices";
import { formatDateShort } from "@/lib/date";
import { wakeTimeLabel } from "@/lib/wakeTime";

const OUTCOME_BADGE_STYLES = {
  accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
  amber: "bg-[var(--amber-soft)] text-[var(--amber)]",
  calm: "bg-[var(--calm-soft)] text-[var(--calm)]",
} as const;

// フィルタボタン専用の短縮ラベル。記録カードのバッジ本体や入力フォームでは
// OUTCOME_OPTIONS.label(正式名称)をそのまま使い、ここだけ1行に収まる長さにする。
const OUTCOME_FILTER_LABELS: Record<Outcome, string> = {
  smooth: "スムーズ",
  reluctant: "行き渋り",
  absent: "休み",
};

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
  const children = useChildren();
  // タイムラインの絞り込みはホーム画面の「今記録している子」とは独立させ、常に
  // 「すべて」から始める(子どもを追加した直後に、既存の未分類の記録が見えなくなるのを防ぐ)。
  const [filterChildId, setFilterChildId] = useState<string | null>(null);
  // 表示フィルタ(スムーズ/行き渋り/行かなかった)。単一選択で、子ども切替と同じ
  // 「常にすべてから始める」方針に揃える。
  const [filterOutcome, setFilterOutcome] = useState<Outcome | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState(false);

  const visibleRecords = records?.filter(
    (r) =>
      (filterChildId === null || r.childId === filterChildId) &&
      (filterOutcome === null || r.outcome === filterOutcome)
  );

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleteError(false);
    try {
      await deleteRecord(deleteTarget);
    } catch {
      setDeleteError(true);
    }
    setDeleteTarget(null);
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 px-4 pt-6">
      <header className="flex items-start justify-between gap-3">
        <h1 className="text-lg font-bold">これまでの記録</h1>
        <Link
          href="/export"
          className="mt-0.5 flex-none whitespace-nowrap text-xs text-[var(--accent)] underline underline-offset-2"
        >
          📄 エクスポート
        </Link>
      </header>

      {children && children.length > 1 && (
        <ChildSwitcher childList={children} selectedId={filterChildId} onSelect={setFilterChildId} allowAll />
      )}

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setFilterOutcome(null)}
          className={`flex-none rounded-full px-3 py-1.5 text-[13px] font-semibold ${
            filterOutcome === null
              ? "bg-[var(--accent)] text-[var(--accent-ink)]"
              : "bg-[var(--surface-2)] text-[var(--sub)]"
          }`}
        >
          すべて
        </button>
        {OUTCOME_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setFilterOutcome(o.value)}
            className={`flex-none whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold ${
              filterOutcome === o.value ? OUTCOME_BADGE_STYLES[o.color] : "bg-[var(--surface-2)] text-[var(--sub)]"
            }`}
          >
            {o.emoji} {OUTCOME_FILTER_LABELS[o.value]}
          </button>
        ))}
      </div>

      {visibleRecords === undefined ? (
        <SkeletonList rows={4} />
      ) : visibleRecords.length === 0 ? (
        <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-center text-sm text-[var(--sub)]">
          {records && records.length > 0
            ? "この条件に一致する記録がありません。"
            : "まだ記録がありません。「記録する」タブから入力してみましょう。"}
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {visibleRecords.map((record) => {
            // own は表示系(パートナーのアバター)用。編集・削除は authLoading 中に
            // 出してはいけないので canEditRecord で別に判定する(#62)。
            const own = isOwnRecord(record, session?.user.id, authLoading);
            const canEdit = canEditRecord(record, session?.user.id, authLoading);
            const outcome = OUTCOME_OPTIONS.find((o) => o.value === record.outcome);
            const legacy = legacyBadge(record);
            const allTags = [
              ...record.wakeTags,
              ...record.triggerTags,
              ...record.reasonTags,
              ...record.responseTags,
            ];
            const editHref = record.childId
              ? `/?date=${record.recordDate}&childId=${record.childId}`
              : `/?date=${record.recordDate}`;
            return (
              <li
                key={record.id}
                className="relative rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3"
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className="whitespace-nowrap text-sm font-bold">{formatDateShort(record.recordDate)}</span>
                  {outcome && (
                    <span
                      className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${OUTCOME_BADGE_STYLES[outcome.color]}`}
                    >
                      {outcome.emoji} {outcome.label}
                    </span>
                  )}
                  {!own && <PartnerAvatar email={emailMap.get(record.userId ?? "")} />}
                  {/* 編集・削除を隣接配置する(#2-1)。誤タップを防ぐため gap-3 で間隔を空ける。 */}
                  <div className="ml-auto flex flex-none items-center gap-3">
                    {canEdit && (
                      <Link
                        href={editHref}
                        aria-label={`${formatDateShort(record.recordDate)}の記録を編集する`}
                        className="-my-1 rounded-full px-2 py-1 text-base leading-none text-[var(--sub)]"
                      >
                        ✏️
                      </Link>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(record.id)}
                        aria-label={`${formatDateShort(record.recordDate)}の記録を削除する`}
                        className="-my-1 rounded-full px-2 py-1 text-base leading-none text-[var(--sub)]"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </div>
                {record.memo && (
                  <p className="mb-2 text-[13px] leading-relaxed text-[var(--ink)] last:mb-0">{record.memo}</p>
                )}
                {(record.wakeTime || legacy || allTags.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 last:mb-0">
                    {record.wakeTime && (
                      <span className="whitespace-nowrap rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[11px] text-[var(--sub)]">
                        {wakeTimeLabel(record.wakeTime) ?? record.wakeTime}起床
                      </span>
                    )}
                    {legacy && (
                      <span className="whitespace-nowrap rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-bold text-[var(--sub)]">
                        {legacy}
                      </span>
                    )}
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
              </li>
            );
          })}
        </ul>
      )}

      {deleteError && (
        <p role="alert" className="text-center text-[13px] font-semibold text-[var(--accent)]">
          削除できませんでした。もう一度お試しください。
        </p>
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
