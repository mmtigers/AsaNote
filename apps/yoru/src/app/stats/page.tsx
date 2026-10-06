"use client";

import { useMemo, useState } from "react";
import { ChildSwitcher } from "@note/core/components/ChildSwitcher";
import { MonthCalendar } from "@/components/MonthCalendar";
import { SkeletonList } from "@note/core/components/Skeleton";
import { EFFECT_OPTIONS, OUTCOME_OPTIONS } from "@/constants/choices";
import { OUTCOME_COLOR_STYLES } from "@/constants/outcomeStyles";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useChildren } from "@/lib/db/children";
import { buildMemberEmailMap, useGroupMembers } from "@note/core/db/groups";
import type { LocalRecord } from "@/lib/db/localDb";
import { useMorningRecords, type MorningOutcome } from "@/lib/db/morning";
import { useRecordsTimeline } from "@/lib/db/queries";
import { formatDateShort, toDateInputValue, toMonthOf } from "@note/core/date";
import {
  averageBedtimeByOutcome,
  bedtimeTrend,
  countOutcomes,
  countTags,
  formatMinutes,
  outcomeByDate,
  outcomeByFriendPromise,
  outcomeByHomeworkStart,
  recordsForFriendPromise,
  recordsForHomeworkStart,
  recordsForOutcome,
  recordsForResponseTag,
  recordsForTag,
  responseEffectStats,
  type OutcomeBucket,
  type OutcomeCounts,
  type TagCount,
} from "./aggregate";
import { StatsDetailSheet } from "./StatsDetailSheet";
import { morningByBedtime, morningByNightOutcome, pairNightWithNextMorning, type MorningBucket } from "./morning";

const CARD = "rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm";

// 様子ごとの割合を積み上げた横バー。
function OutcomeBar({ counts, total }: { counts: OutcomeCounts; total: number }) {
  return (
    <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
      {OUTCOME_OPTIONS.map((o) =>
        counts[o.value] > 0 ? (
          <div
            key={o.value}
            className={OUTCOME_COLOR_STYLES[o.value]}
            style={{ width: `${(counts[o.value] / total) * 100}%` }}
          />
        ) : null
      )}
    </div>
  );
}

// 件数も併記するのは、1〜2件しかない行の割合を傾向として読み違えないようにするため。
function OutcomeBucketList({
  title,
  hint,
  data,
  onSelect,
}: {
  title: string;
  hint: string;
  data: OutcomeBucket[];
  onSelect: (bucket: OutcomeBucket) => void;
}) {
  if (data.length === 0) return null;
  return (
    <section className={CARD}>
      <h2 className="text-sm font-bold">{title}</h2>
      <p className="mb-3 mt-1 text-[11px] text-[var(--sub)]">{hint}</p>
      <div className="flex flex-col gap-2.5">
        {data.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => onSelect(b)}
            aria-label={`${b.label}の記録を見る`}
            className="flex items-center gap-2.5 text-left focus:ring-2 focus:ring-[var(--accent)]"
          >
            <span className="w-20 flex-none truncate text-[13px]">{b.label}</span>
            <OutcomeBar counts={b.counts} total={b.total} />
            <span className="w-9 flex-none text-right text-[12px] font-bold tabular-nums">{b.roughRate}%</span>
            <span className="w-8 flex-none text-right text-[11px] tabular-nums text-[var(--sub)]">{b.total}件</span>
          </button>
        ))}
      </div>
    </section>
  );
}

const MORNING_STYLES: Record<MorningOutcome, string> = {
  smooth: "bg-[var(--accent)]",
  reluctant: "bg-[var(--amber)]",
  absent: "bg-[var(--calm)]",
};
const MORNING_LABELS: Record<MorningOutcome, string> = { smooth: "スムーズ", reluctant: "行き渋り", absent: "お休み" };

// あさノートの翌朝の結果。右の%は「行き渋り+お休み」の割合。
function MorningBucketList({ title, hint, data }: { title: string; hint: string; data: MorningBucket[] }) {
  if (data.length === 0) return null;
  return (
    <section className={CARD}>
      <h2 className="text-sm font-bold">{title}</h2>
      <p className="mb-3 mt-1 text-[11px] text-[var(--sub)]">{hint}</p>
      <div className="flex flex-col gap-3">
        {data.map((b) => (
          <div key={b.key}>
            <div className="flex items-center gap-2.5">
              <span className="w-20 flex-none truncate text-[13px]">{b.label}</span>
              <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                {(Object.keys(MORNING_STYLES) as MorningOutcome[]).map((k) =>
                  b.counts[k] > 0 ? (
                    <div key={k} className={MORNING_STYLES[k]} style={{ width: `${(b.counts[k] / b.total) * 100}%` }} />
                  ) : null
                )}
              </div>
              <span className="w-9 flex-none text-right text-[12px] font-bold tabular-nums">
                {b.total > 0 ? `${b.strugglingRate}%` : "―"}
              </span>
              <span className="w-8 flex-none text-right text-[11px] tabular-nums text-[var(--sub)]">{b.total}件</span>
            </div>
            <p className="ml-[calc(5rem+0.625rem)] mt-0.5 text-[11px] text-[var(--sub)]">
              {(Object.keys(MORNING_LABELS) as MorningOutcome[]).map((k) => `${MORNING_LABELS[k]}${b.counts[k]}`).join(" ・ ")}
              {b.averageWakeMinutes !== null && ` ・ 平均起床 ${formatMinutes(b.averageWakeMinutes)}`}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function TagBarList({
  title,
  data,
  onSelect,
}: {
  title: string;
  data: TagCount[];
  onSelect: (item: TagCount) => void;
}) {
  if (data.length === 0) return null;
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <section className={CARD}>
      <h2 className="mb-3 text-sm font-bold">{title}</h2>
      <div className="flex flex-col gap-2.5">
        {data.slice(0, 6).map((item) => (
          <button
            key={item.tag}
            type="button"
            onClick={() => onSelect(item)}
            aria-label={`${item.tag}の記録を見る`}
            className="flex items-center gap-2.5 text-left focus:ring-2 focus:ring-[var(--accent)]"
          >
            <span className="w-28 flex-none truncate text-[13px]">{item.tag}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${Math.max(6, (item.count / max) * 100)}%` }}
              />
            </div>
            <span className="w-6 flex-none text-right text-[12px] tabular-nums text-[var(--sub)]">{item.count}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function StatsPage() {
  const { session, loading: authLoading } = useAuth();
  const members = useGroupMembers();
  const emailMap = useMemo(() => buildMemberEmailMap(members), [members]);
  const [detail, setDetail] = useState<{ title: string; records: LocalRecord[] } | null>(null);
  const records = useRecordsTimeline();
  const children = useChildren();
  const morningRecords = useMorningRecords();
  const [filterChildId, setFilterChildId] = useState<string | null>(null);
  const todayValue = useMemo(() => toDateInputValue(new Date()), []);
  const [displayMonth, setDisplayMonth] = useState(() => toMonthOf(todayValue));
  const filtered = useMemo(
    () => records?.filter((r) => filterChildId === null || r.childId === filterChildId),
    [records, filterChildId]
  );

  const summary = useMemo(() => {
    if (!filtered) return null;
    const rough = filtered.filter((r) => r.outcome === "rough" || r.outcome === "storm");
    return {
      total: filtered.length,
      outcomes: countOutcomes(filtered),
      calendar: outcomeByDate(filtered),
      hwStart: outcomeByHomeworkStart(filtered),
      friend: outcomeByFriendPromise(filtered),
      bedByOutcome: averageBedtimeByOutcome(filtered),
      bedTrend: bedtimeTrend(filtered),
      triggers: countTags(rough, (r) => r.trigger),
      responses: responseEffectStats(filtered),
    };
  }, [filtered]);

  // あさノートの記録が読めるとき(共有モード)だけ、夜 → 翌朝の傾向を出す。
  const morning = useMemo(() => {
    if (!filtered || !morningRecords) return null;
    const pairs = pairNightWithNextMorning(filtered, morningRecords);
    return {
      pairs: pairs.length,
      byBedtime: morningByBedtime(pairs),
      byNight: morningByNightOutcome(pairs, OUTCOME_OPTIONS),
    };
  }, [filtered, morningRecords]);

  const childList = children ?? [];

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 px-4 pt-6">
      <header>
        <h1 className="text-lg font-bold">傾向</h1>
        <p className="mt-1 text-xs text-[var(--sub)]">夜のようすの傾向をまとめています。</p>
      </header>

      {childList.length >= 2 && (
        <ChildSwitcher childList={childList} selectedId={filterChildId} onSelect={setFilterChildId} allowAll />
      )}

      {!summary ? (
        <SkeletonList rows={3} />
      ) : summary.total === 0 ? (
        <p className="rounded-3xl bg-[var(--surface-2)] px-4 py-6 text-center text-sm text-[var(--sub)]">
          記録がまだ無いので、ここには何も表示されません。
        </p>
      ) : (
        <>
          <section className={CARD}>
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-bold">様子の内訳</h2>
              <span className="text-[11px] text-[var(--sub)]">全{summary.total}件</span>
            </div>
            {summary.outcomes.total > 0 ? (
              <>
                <div className="mt-3 flex">
                  <OutcomeBar counts={summary.outcomes.counts} total={summary.outcomes.total} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {OUTCOME_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() =>
                        setDetail({ title: `${o.emoji} ${o.label}`, records: recordsForOutcome(filtered ?? [], o.value) })
                      }
                      aria-label={`${o.label}の記録を見る`}
                      className="rounded-2xl py-1 text-center focus:ring-2 focus:ring-[var(--accent)]"
                    >
                      <p className="text-lg leading-none">{o.emoji}</p>
                      <p className="mt-1 text-lg font-bold tabular-nums">{summary.outcomes.counts[o.value]}</p>
                      <p className="text-[11px] text-[var(--sub)]">{o.label}</p>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-2 text-[12px] text-[var(--sub)]">今夜の様子を選んで記録すると、内訳が出ます。</p>
            )}
          </section>

          <div className="flex flex-col gap-2">
            <MonthCalendar
              year={displayMonth.year}
              month={displayMonth.month}
              todayValue={todayValue}
              statusByDate={summary.calendar}
              onMonthChange={(year, month) => setDisplayMonth({ year, month })}
            />
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-[var(--sub)]">
              {OUTCOME_OPTIONS.map((o) => (
                <span key={o.value} className="flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-full ${OUTCOME_COLOR_STYLES[o.value]}`} />
                  {o.label}
                </span>
              ))}
            </div>
          </div>

          <OutcomeBucketList
            title="📚 宿題開始時刻と様子"
            hint="バーは様子の割合、右の%は荒れた(少し荒れた+大荒れ)割合。開始時刻と様子を入力した記録だけ。"
            data={summary.hwStart}
            onSelect={(b) =>
              setDetail({ title: `宿題開始 ${b.label}`, records: recordsForHomeworkStart(filtered ?? [], b.key) })
            }
          />
          <OutcomeBucketList
            title="👫 友達との約束と様子"
            hint="「約束あり」「約束なし」を選んだ記録だけ。"
            data={summary.friend}
            onSelect={(b) =>
              setDetail({ title: `友達と${b.label}`, records: recordsForFriendPromise(filtered ?? [], b.key) })
            }
          />

          {summary.bedByOutcome.length > 0 && (
            <section className={CARD}>
              <h2 className="text-sm font-bold">🌙 消灯時刻と様子</h2>
              <p className="mb-3 mt-1 text-[11px] text-[var(--sub)]">様子ごとの平均消灯時刻。</p>
              <div className="grid grid-cols-3 gap-2">
                {OUTCOME_OPTIONS.map((o) => {
                  const stat = summary.bedByOutcome.find((s) => s.outcome === o.value);
                  return (
                    <div key={o.value} className="rounded-2xl bg-[var(--surface-2)] py-2.5 text-center">
                      <p className="text-[11px] text-[var(--sub)]">
                        {o.emoji} {o.label}
                      </p>
                      <p className="mt-1 text-base font-bold tabular-nums">
                        {stat ? formatMinutes(stat.averageMinutes) : "―"}
                      </p>
                      {stat && <p className="text-[10px] text-[var(--sub)]">{stat.count}件</p>}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {summary.bedTrend.length > 0 && (
            <section className={CARD}>
              <h2 className="text-sm font-bold">消灯時刻の推移</h2>
              <p className="mb-3 mt-1 text-[11px] text-[var(--sub)]">直近{summary.bedTrend.length}日。色は様子。</p>
              <div className="flex flex-col gap-1.5">
                {summary.bedTrend.map((p) => (
                  <div key={p.date} className="flex items-center gap-2">
                    <span className="w-14 flex-none text-[11px] text-[var(--sub)]">{formatDateShort(p.date)}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                      {/* 19:00〜23:00 を横幅いっぱいに対応させる */}
                      <div
                        className={`h-full rounded-full ${p.outcome ? OUTCOME_COLOR_STYLES[p.outcome] : "bg-[var(--sub)]"}`}
                        style={{ width: `${Math.min(100, Math.max(4, ((p.minutes - 19 * 60) / (4 * 60)) * 100))}%` }}
                      />
                    </div>
                    <span className="w-11 flex-none text-right text-[12px] tabular-nums">{formatMinutes(p.minutes)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {morning && morning.pairs > 0 && (
            <>
              <MorningBucketList
                title="☀️ 消灯時刻と翌朝(あさノート)"
                hint={`夜の消灯時刻と、翌朝のあさノートの結果。右の%は行き渋り+お休みの割合。翌朝の記録がある${morning.pairs}夜が対象。`}
                data={morning.byBedtime}
              />
              <MorningBucketList
                title="☀️ 夜の様子と翌朝(あさノート)"
                hint="夜が荒れた翌朝は行き渋りやすいか。件数が少ないうちは目安として見てください。"
                data={morning.byNight}
              />
            </>
          )}

          <TagBarList
            title="⚡ 荒れた日のきっかけ"
            data={summary.triggers}
            onSelect={(item) =>
              setDetail({
                title: `きっかけ: ${item.tag}`,
                records: recordsForTag(
                  (filtered ?? []).filter((r) => r.outcome === "rough" || r.outcome === "storm"),
                  (r) => r.trigger,
                  item.tag
                ),
              })
            }
          />

          {summary.responses.length > 0 && (
            <section className={CARD}>
              <h2 className="text-sm font-bold">🤝 効いた対応</h2>
              <p className="mb-3 mt-1 text-[11px] text-[var(--sub)]">
                効き具合を入力した記録だけ。効き具合は1件につき1つのため、複数の対応を選んだ日は同じ評価で数えます。
              </p>
              <div className="flex flex-col gap-3">
                {summary.responses.slice(0, 6).map((s) => (
                  <button
                    key={s.tag}
                    type="button"
                    onClick={() =>
                      setDetail({ title: `対応: ${s.tag}`, records: recordsForResponseTag(filtered ?? [], s.tag) })
                    }
                    aria-label={`${s.tag}の記録を見る`}
                    className="text-left focus:ring-2 focus:ring-[var(--accent)]"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="text-[13px]">{s.tag}</span>
                      <span className="text-[11px] tabular-nums text-[var(--sub)]">{s.total}件</span>
                    </div>
                    <div className="mt-1 flex gap-3 text-[12px] tabular-nums text-[var(--sub)]">
                      {EFFECT_OPTIONS.map((e) => (
                        <span key={e.value}>
                          {e.label} {s.effects[e.value]}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {detail && (
        <StatsDetailSheet
          title={detail.title}
          records={detail.records}
          currentUserId={session?.user.id ?? null}
          authLoading={authLoading}
          emailMap={emailMap}
          onClose={() => setDetail(null)}
        />
      )}
    </main>
  );
}
