"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PartnerAvatar } from "@/components/PartnerAvatar";
import { canEditRecord, isOwnRecord } from "@/lib/db/ownership";
import type { LocalRecord } from "@/lib/db/localDb";
import { OUTCOME_OPTIONS } from "@/constants/choices";
import { formatDateShort } from "@note/core/date";
import { computeDetailStats, groupRecordsByPeriod, type PeriodUnit } from "@note/core/stats/detail";

const OUTCOME_BADGE_STYLES = {
  accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
  amber: "bg-[var(--amber-soft)] text-[var(--amber)]",
  calm: "bg-[var(--calm-soft)] text-[var(--calm)]",
} as const;

const PERIOD_OPTIONS: { value: PeriodUnit; label: string }[] = [
  { value: "day", label: "日別" },
  { value: "week", label: "週別" },
  { value: "month", label: "月別" },
];

interface StatsDetailSheetProps {
  title: string;
  // この項目に該当する記録(呼び出し側で既に絞り込み済み)。新しい順に渡す想定。
  records: LocalRecord[];
  currentUserId: string | null | undefined;
  authLoading: boolean;
  emailMap: Map<string, string | null>;
  onClose: () => void;
}

// 傾向タブの各項目タップ時の詳細(#3-3)。期間別推移(日/週/月切替)・簡単な統計値・
// 該当する過去の記録一覧(自分の記録はタップでその日の記録へ)を表示する。
export function StatsDetailSheet({
  title,
  records,
  currentUserId,
  authLoading,
  emailMap,
  onClose,
}: StatsDetailSheetProps) {
  const [unit, setUnit] = useState<PeriodUnit>("day");
  const trend = groupRecordsByPeriod(records, unit);
  const stats = computeDetailStats(records);
  const maxCount = Math.max(1, ...trend.map((t) => t.count));

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-[var(--surface)] sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <h2 className="text-base font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="rounded-full px-2 py-1 text-lg leading-none text-[var(--sub)]"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {records.length === 0 ? (
            <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-center text-sm text-[var(--sub)]">
              まだ記録がありません。
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-[var(--surface-2)] py-3 text-center">
                  <p className="text-lg font-bold tabular-nums">{stats.total}</p>
                  <p className="text-[11px] text-[var(--sub)]">記録日数</p>
                </div>
                <div className="rounded-2xl bg-[var(--surface-2)] py-3 text-center">
                  <p className="text-lg font-bold">{stats.modeWeekdayLabel ?? "―"}</p>
                  <p className="text-[11px] text-[var(--sub)]">最も多い曜日</p>
                </div>
                <div className="rounded-2xl bg-[var(--surface-2)] py-3 text-center">
                  <p className="text-lg font-bold tabular-nums">{stats.monthlyAverage}</p>
                  <p className="text-[11px] text-[var(--sub)]">月平均件数</p>
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold">期間別推移</h3>
                  <div className="flex gap-1">
                    {PERIOD_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setUnit(opt.value)}
                        aria-pressed={unit === opt.value}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          unit === opt.value
                            ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                            : "bg-[var(--surface-2)] text-[var(--sub)]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  {trend.map((point) => (
                    <div key={point.key} className="flex items-center gap-2">
                      <span className="w-14 flex-none truncate text-[11px] text-[var(--sub)]">{point.label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                        <div
                          className="h-full rounded-full bg-[var(--accent)]"
                          style={{ width: `${Math.max(6, (point.count / maxCount) * 100)}%` }}
                        />
                      </div>
                      <span className="w-5 flex-none text-right text-[11px] tabular-nums text-[var(--sub)]">
                        {point.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5">
                <h3 className="mb-2 text-sm font-bold">過去の記録</h3>
                <ul className="flex flex-col gap-2">
                  {records.map((record) => {
                    const own = isOwnRecord(record, currentUserId, authLoading);
                    const canEdit = canEditRecord(record, currentUserId, authLoading);
                    const outcome = OUTCOME_OPTIONS.find((o) => o.value === record.outcome);
                    const editHref = record.childId
                      ? `/?date=${record.recordDate}&childId=${record.childId}`
                      : `/?date=${record.recordDate}`;
                    const content = (
                      <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5">
                        <span className="text-[13px] font-bold">{formatDateShort(record.recordDate)}</span>
                        {outcome && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${OUTCOME_BADGE_STYLES[outcome.color]}`}
                          >
                            {outcome.emoji} {outcome.label}
                          </span>
                        )}
                        {!own && <PartnerAvatar email={emailMap.get(record.userId ?? "")} />}
                        {canEdit && <span className="ml-auto text-[11px] text-[var(--accent)]">編集する →</span>}
                      </div>
                    );
                    return (
                      <li key={record.id}>
                        {canEdit ? (
                          <Link
                            href={editHref}
                            aria-label={`${formatDateShort(record.recordDate)}の記録を編集する`}
                            className="block"
                          >
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
