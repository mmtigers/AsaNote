"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDateLabel } from "@note/core/date";
import { fetchOwnRecordStatuses, type RecordStatus } from "@/lib/db/records";
import { describeServerError } from "@/lib/errors";
import { addDaysToDate, todayJst } from "@/lib/jst";

type DayState = "completed" | "partial" | "none";

const STATE_LABELS: Record<DayState, string> = {
  completed: "✓ 完了",
  partial: "途中まで",
  none: "未記録",
};

export function dayState(status: RecordStatus | undefined): DayState {
  if (!status) return "none";
  return status.completedAt ? "completed" : "partial";
}

/** 親のホーム。今日の記録への入口と、直近7日の記録の状況(過去の日も開いて修正できる)。 */
export function ParentHome({ userId }: { userId: string }) {
  const today = todayJst();
  const days = Array.from({ length: 7 }, (_, i) => addDaysToDate(today, -i));
  const [statuses, setStatuses] = useState<Map<string, RecordStatus> | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOwnRecordStatuses(userId, addDaysToDate(today, -6), today)
      .then((list) => {
        if (!cancelled) setStatuses(new Map(list.map((s) => [s.recordDate, s])));
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, today]);

  const todayState = statuses ? dayState(statuses.get(today)) : null;

  return (
    <section className="flex flex-col gap-4">
      <Link
        href={`/record?date=${today}`}
        className="flex min-h-20 flex-col items-center justify-center rounded-3xl bg-[var(--accent)] px-4 py-5 text-center text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent-soft)]"
      >
        <span className="text-2xl font-bold">{todayState === "completed" ? "今日の記録を見る・直す" : "今日の記録をつける"}</span>
        {todayState && <span className="mt-1 text-base">今日: {STATE_LABELS[todayState]}</span>}
      </Link>

      <h2 className="mt-2 text-lg font-bold">この1週間</h2>
      {error !== null && <p role="alert" className="text-base text-[var(--holiday)]">{describeServerError(error, "記録の状況を読み込めませんでした。")}</p>}
      <ul className="flex flex-col gap-2">
        {days.map((date) => {
          const state = statuses ? dayState(statuses.get(date)) : null;
          return (
            <li key={date}>
              <Link
                href={`/record?date=${date}`}
                className="flex min-h-12 items-center justify-between rounded-2xl bg-[var(--surface)] px-4 py-3 text-base focus:ring-2 focus:ring-[var(--accent)]"
              >
                <span>{date === today ? `今日(${formatDateLabel(date)})` : formatDateLabel(date)}</span>
                <span className={state === "completed" ? "font-bold text-[var(--calm)]" : "text-[var(--sub)]"}>{state ? STATE_LABELS[state] : "…"}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
