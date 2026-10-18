"use client";

import { useEffect, useState } from "react";
import { RecordDetails } from "@/components/RecordDetails";
import { fetchRecord, type DailyRecord } from "@/lib/db/records";
import { describeServerError } from "@/lib/errors";
import { DAY_STATE_LABELS, dayState } from "@/lib/recordStats";

/** 父・母の1日の記録を読むだけの画面の中身(家族管理者・閲覧者。SPEC §6)。 */
export function RecordViewer({ userId, recordDate }: { userId: string; recordDate: string }) {
  const [result, setResult] = useState<{ record: DailyRecord | null } | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRecord(userId, recordDate)
      .then((record) => {
        if (!cancelled) setResult({ record });
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, recordDate]);

  if (error !== null) return <p role="alert" className="text-base text-[var(--holiday)]">{describeServerError(error, "記録を読み込めませんでした。")}</p>;
  if (!result) return <p className="text-base text-[var(--sub)]">読み込み中...</p>;
  const state = dayState(result.record ?? undefined);

  return (
    <div className="flex flex-col gap-4">
      <p
        className={`rounded-2xl px-4 py-3 text-base font-bold ${
          state === "completed" ? "bg-[var(--calm-soft)]" : state === "partial" ? "bg-[var(--accent-soft)]" : "bg-[var(--surface-2)]"
        }`}
      >
        {state === "none" ? "この日の記録はありません" : state === "partial" ? "途中まで(完了していません)" : DAY_STATE_LABELS.completed}
      </p>
      {result.record && <RecordDetails record={result.record} />}
    </div>
  );
}
