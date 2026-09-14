"use client";

import { useMemo } from "react";
import { SkeletonList } from "@/components/Skeleton";
import { useRecordsTimeline } from "@/lib/db/queries";
import type { LocalRecord } from "@/lib/db/localDb";

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
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
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

export default function StatsPage() {
  const records = useRecordsTimeline();

  const summary = useMemo(() => {
    if (!records) return null;
    const total = records.length;
    const handoffCount = records.filter((r) => r.handoff && r.handoff !== "なし").length;
    const aloneCount = records.filter((r) => r.companion === "一人で").length;
    const wakeTimes = records.map((r) => r.wakeTime).filter((t): t is string => !!t);
    const avgWake = wakeTimes.length
      ? (() => {
          const totalMin = wakeTimes.reduce((sum, t) => {
            const [h, m] = t.split(":").map(Number);
            return sum + h * 60 + m;
          }, 0);
          const avg = Math.round(totalMin / wakeTimes.length);
          return `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(avg % 60).padStart(2, "0")}`;
        })()
      : null;

    // 「渋ったか」を選んで保存した記録のみが対象(古い記録・未選択分は集計から除く)。
    const classified = records.filter((r) => r.struggled === true || r.struggled === false);
    const smoothRecords = classified.filter((r) => r.struggled === false);
    const smoothCount = smoothRecords.length;
    const smoothRate = classified.length ? Math.round((smoothCount / classified.length) * 100) : null;

    return {
      total,
      handoffCount,
      aloneCount,
      avgWake,
      smoothCount,
      smoothTotal: classified.length,
      smoothRate,
      // 渋った日と違い、うまくいった日は「様子」タグを集めないため、代わりに
      // 常に入力される同行者を「よく出る傾向」として集計する。
      smoothCompanions: countTags(smoothRecords, (r) => (r.companion ? [r.companion] : [])),
      triggers: countTags(records, (r) => r.triggerTags.filter((t) => t !== "特になし")),
      reasons: countTags(records, (r) => r.reasonTags),
      responses: countTags(records, (r) => r.responseTags),
    };
  }, [records]);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 px-4 pt-6">
      <header>
        <h1 className="text-lg font-bold">傾向</h1>
        <p className="mt-1 text-xs text-[var(--sub)]">
          これまでの記録から、よくある「きっかけ」「理由」「対応」を集計しています。
        </p>
      </header>

      {!summary ? (
        <SkeletonList rows={3} />
      ) : summary.total === 0 ? (
        <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-center text-sm text-[var(--sub)]">
          記録がまだ無いので、ここには何も表示されません。
        </p>
      ) : (
        <>
          <section className="grid grid-cols-3 gap-2.5">
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 text-center">
              <p className="text-[11px] text-[var(--sub)]">記録数</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{summary.total}</p>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 text-center">
              <p className="text-[11px] text-[var(--sub)]">平均起床</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{summary.avgWake ?? "-"}</p>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 text-center">
              <p className="text-[11px] text-[var(--sub)]">引き渡し</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-[var(--amber)]">
                {summary.handoffCount}
              </p>
            </div>
          </section>

          {summary.smoothTotal > 0 && (
            <section className="rounded-2xl border border-[var(--line)] bg-[var(--accent-soft)] p-4">
              <h2 className="mb-1 text-sm font-bold">😊 スムーズだった日</h2>
              <p className="text-2xl font-bold tabular-nums text-[var(--accent)]">
                {summary.smoothCount}
                <span className="ml-1 text-sm font-medium">日</span>
                <span className="ml-2 text-base font-medium">({summary.smoothRate}%)</span>
              </p>
              <p className="mt-1 text-[11px] text-[var(--sub)]">
                「今日はどうだった？」を選んだ{summary.smoothTotal}日のうち
              </p>
            </section>
          )}

          <BarList
            title="うまくいった日によく見られる同行スタイル"
            data={summary.smoothCompanions}
            total={summary.smoothCount}
          />
          <BarList title="前日のきっかけ" data={summary.triggers} total={summary.total} />
          <BarList title="渋る理由" data={summary.reasons} total={summary.total} />
          <BarList title="親の対応" data={summary.responses} total={summary.total} />
        </>
      )}
    </main>
  );
}
