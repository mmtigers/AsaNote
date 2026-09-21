"use client";

import { useMemo, useState } from "react";
import { ChildSwitcher } from "@/components/ChildSwitcher";
import { MonthCalendar } from "@/components/MonthCalendar";
import { SkeletonList } from "@/components/Skeleton";
import { useChildren } from "@/lib/db/children";
import { useRecordsTimeline } from "@/lib/db/queries";
import type { LocalRecord } from "@/lib/db/localDb";
import { OUTCOME_OPTIONS, type Outcome } from "@/constants/choices";
import { OUTCOME_COLOR_STYLES } from "@/constants/outcomeStyles";
import { toDateInputValue, toMonthOf } from "@/lib/date";
import {
  outcomeByDate,
  smoothRateByWakeTime,
  smoothRateByWeekday,
  type SmoothRateStat,
} from "./aggregate";

function countTags(records: LocalRecord[], pick: (r: LocalRecord) => string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const r of records) {
    for (const tag of pick(r)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

function BarList({ title, data, total }: { title: string; data: [string, number][]; total: number }) {
  if (data.length === 0) return null;
  return (
    <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-bold">{title}</h2>
      <div className="flex flex-col gap-2.5">
        {data.slice(0, 6).map(([label, count]) => (
          <div key={label} className="flex items-center gap-2.5">
            <span className="w-28 flex-none truncate text-[13px] text-[var(--ink)]">{label}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${Math.max(6, (count / total) * 100)}%` }}
              />
            </div>
            <span className="w-6 flex-none text-right text-[12px] tabular-nums text-[var(--sub)]">
              {count}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// 曜日別・起床時刻別のスムーズ率(#4)。件数も併記するのは、1〜2件しかない行の割合を
// 傾向として読み違えないようにするため。
function SmoothRateList({ title, hint, data }: { title: string; hint: string; data: SmoothRateStat[] }) {
  if (data.length === 0) return null;
  return (
    <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
      <h2 className="text-sm font-bold">{title}</h2>
      <p className="mb-3 mt-1 text-[11px] text-[var(--sub)]">{hint}</p>
      <div className="flex flex-col gap-2.5">
        {data.map((stat) => (
          <div key={stat.key} className="flex items-center gap-2.5">
            <span className="w-16 flex-none truncate text-[13px] text-[var(--ink)]">{stat.label}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${stat.rate}%` }}
              />
            </div>
            <span className="w-8 flex-none text-right text-[12px] font-bold tabular-nums text-[var(--ink)]">
              {stat.rate}%
            </span>
            <span className="w-8 flex-none text-right text-[11px] tabular-nums text-[var(--sub)]">
              {stat.total}件
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function StatsPage() {
  const records = useRecordsTimeline();
  const children = useChildren();
  // タイムラインと同様、常に「すべて」から始める(独立したローカルstate)。
  const [filterChildId, setFilterChildId] = useState<string | null>(null);
  const todayValue = useMemo(() => toDateInputValue(new Date()), []);
  // カレンダーに表示中の月。◀▶で過去の月も振り返れるようにstateで持つ。
  const [displayMonth, setDisplayMonth] = useState(() => toMonthOf(todayValue));
  const filteredRecords = useMemo(
    () => records?.filter((r) => filterChildId === null || r.childId === filterChildId),
    [records, filterChildId]
  );

  // カレンダーの色分け用(#4)。ホーム画面のカレンダーと違い、パートナーの記録も
  // 含めた「その日の結果」を見る(振り返りが目的のため)。
  const calendarStatus = useMemo(
    () => (filteredRecords ? outcomeByDate(filteredRecords) : undefined),
    [filteredRecords]
  );

  const summary = useMemo(() => {
    if (!filteredRecords) return null;
    const total = filteredRecords.length;

    // 「今日はどうだった？」を選んで保存した記録のみが対象(未選択・旧形式の記録は除く)。
    const classified = filteredRecords.filter((r): r is LocalRecord & { outcome: Outcome } => !!r.outcome);
    const byOutcome = OUTCOME_OPTIONS.map((opt) => {
      const matched = classified.filter((r) => r.outcome === opt.value);
      return {
        ...opt,
        count: matched.length,
        rate: classified.length ? Math.round((matched.length / classified.length) * 100) : 0,
        records: matched,
      };
    });

    const smoothRecords = byOutcome.find((o) => o.value === "smooth")?.records ?? [];
    const notSmoothRecords = classified.filter((r) => r.outcome !== "smooth");

    return {
      total,
      classifiedTotal: classified.length,
      byOutcome,
      positiveReasons: countTags(smoothRecords, (r) => r.reasonTags),
      negativeReasons: countTags(notSmoothRecords, (r) => r.reasonTags),
      byWeekday: smoothRateByWeekday(filteredRecords),
      byWakeTime: smoothRateByWakeTime(filteredRecords),
    };
  }, [filteredRecords]);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 px-4 pt-6">
      <header>
        <h1 className="text-lg font-bold">🌷 傾向</h1>
        <p className="mt-1 text-xs text-[var(--sub)]">
          いい日も気になる日も、どちらも振り返れるようにまとめています。
        </p>
      </header>

      {children && children.length > 1 && (
        <ChildSwitcher childList={children} selectedId={filterChildId} onSelect={setFilterChildId} allowAll />
      )}

      {!summary ? (
        <SkeletonList rows={3} />
      ) : summary.total === 0 ? (
        <p className="rounded-3xl bg-[var(--surface-2)] px-4 py-6 text-center text-sm text-[var(--sub)]">
          記録がまだ無いので、ここには何も表示されません。
        </p>
      ) : (
        <>
          <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-bold">これまでの内訳</h2>
              <span className="text-[11px] text-[var(--sub)]">全{summary.total}件</span>
            </div>

            {summary.classifiedTotal > 0 ? (
              <>
                <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  {summary.byOutcome.map((o) =>
                    o.count > 0 ? (
                      <div
                        key={o.value}
                        className={OUTCOME_COLOR_STYLES[o.value]}
                        style={{ width: `${o.rate}%` }}
                      />
                    ) : null
                  )}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {summary.byOutcome.map((o) => (
                    <div key={o.value} className="text-center">
                      <p className="text-lg leading-none">{o.emoji}</p>
                      <p className="mt-1 text-lg font-bold tabular-nums">{o.count}</p>
                      <p className="text-[11px] text-[var(--sub)]">{o.label}({o.rate}%)</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-2 text-[12px] text-[var(--sub)]">
                「今日はどうだった？」を選んで記録すると、ここに内訳が出ます。
              </p>
            )}
          </section>

          <div className="flex flex-col gap-2">
            <MonthCalendar
              year={displayMonth.year}
              month={displayMonth.month}
              todayValue={todayValue}
              statusByDate={calendarStatus}
              onMonthChange={(year, month) => setDisplayMonth({ year, month })}
            />
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-[var(--sub)]">
              {OUTCOME_OPTIONS.map((o) => (
                <span key={o.value} className="flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-full ${OUTCOME_COLOR_STYLES[o.value]}`} />
                  {o.label}
                </span>
              ))}
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full border border-[var(--line)] bg-[var(--surface-2)]" />
                記録なし
              </span>
            </div>
          </div>

          <SmoothRateList
            title="📅 曜日別のスムーズ率"
            hint="結果を選んで記録した日だけを数えています。"
            data={summary.byWeekday}
          />
          <SmoothRateList
            title="⏰ 起床時刻とスムーズ率"
            hint="起床時刻を入力した記録だけを数えています。"
            data={summary.byWakeTime}
          />

          <BarList title="😊 よかった日によく見られる理由" data={summary.positiveReasons} total={summary.total} />
          <BarList title="😣 気になる日によく見られる理由" data={summary.negativeReasons} total={summary.total} />
        </>
      )}
    </main>
  );
}
