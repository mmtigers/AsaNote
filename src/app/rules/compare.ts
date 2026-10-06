// 「試したこと」の前後比較。画面から切り離した純関数として置き、テストで固定する。
import { addDays, parseTimeToMinutes } from "@/lib/date";
import { countOutcomes, roughRate, type AggregatableRecord, type OutcomeCounts } from "@/app/stats/aggregate";

export const COMPARE_WINDOW_DAYS = 14;

export interface PeriodSummary {
  from: string;
  to: string;
  total: number;
  counts: OutcomeCounts;
  roughRate: number; // 百分率。total が 0 のときは意味を持たないので呼び出し側で件数を見る
  averageBedMinutes: number | null;
  bedCount: number;
}

export interface RuleComparison {
  before: PeriodSummary;
  after: PeriodSummary;
  // 開始日がまだ来ていない(または開始日当日で記録が無い)ときは後の期間が空になる。
  hasAfter: boolean;
}

function summarize(records: AggregatableRecord[], from: string, to: string): PeriodSummary {
  const inRange = records.filter((r) => r.recordDate >= from && r.recordDate <= to);
  const { total, counts } = countOutcomes(inRange);
  const beds = inRange.flatMap((r) => {
    const m = r.times.bed ? parseTimeToMinutes(r.times.bed) : null;
    return m === null ? [] : [m];
  });
  return {
    from,
    to,
    total,
    counts,
    roughRate: roughRate(counts),
    averageBedMinutes: beds.length ? Math.round(beds.reduce((a, b) => a + b, 0) / beds.length) : null,
    bedCount: beds.length,
  };
}

// 開始日の直前windowDays日と、開始日から(終了日 or 今日、最大windowDays日)を比べる。
// 後ろの期間は開始日を含む。records は呼び出し側で対象の子どもに絞っておく。
export function compareAroundRule(
  records: AggregatableRecord[],
  rule: { startedOn: string; endedOn: string | null },
  today: string,
  windowDays = COMPARE_WINDOW_DAYS
): RuleComparison {
  const { startedOn, endedOn } = rule;
  const afterEnd = [endedOn ?? today, today, addDays(startedOn, windowDays - 1)].reduce((a, b) => (a < b ? a : b));
  const before = summarize(records, addDays(startedOn, -windowDays), addDays(startedOn, -1));
  const after = summarize(records, startedOn, afterEnd);
  return { before, after, hasAfter: afterEnd >= startedOn };
}
