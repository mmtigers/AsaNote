// 「試したこと」の前後比較。画面から切り離した純関数として置き、テストで固定する。
// 期間の切り方は、よるノート(apps/yoru/src/app/rules/compare.ts)と同じ。見る値だけが違う
// (あさノートは行き渋り率と起床の時間帯、よるノートは荒れた割合と消灯の時間帯)。
import { addDays } from "@note/core/date";
import { WAKE_SLOTS, wakeSlotOfTimeValue } from "@/lib/wakeTime";
import type { AggregatableRecord } from "@/app/stats/aggregate";

export const COMPARE_WINDOW_DAYS = 14;

export interface PeriodSummary {
  from: string;
  to: string;
  total: number; // 結果を選んで記録した件数
  reluctant: number; // そのうち「行き渋った」「行かなかった」の件数
  reluctantRate: number; // 百分率。total が 0 のときは意味を持たないので呼び出し側で件数を見る
  // 起床の時間帯で最も多かったもの(同数なら早い帯)。起床時刻の入力が無い期間は null。
  commonWake: { label: string; count: number } | null;
  wakeCount: number; // 起床時刻の入力がある件数
}

export interface RuleComparison {
  before: PeriodSummary;
  after: PeriodSummary;
  // 開始日がまだ来ていないときは後の期間が空になる。
  hasAfter: boolean;
}

function summarize(records: AggregatableRecord[], from: string, to: string): PeriodSummary {
  const inRange = records.filter((r) => r.recordDate >= from && r.recordDate <= to);
  // 傾向タブ(aggregate.ts)と同じく、結果を選んだ記録だけを割合の対象にする。
  const withOutcome = inRange.filter((r) => !!r.outcome);
  const total = withOutcome.length;
  const reluctant = withOutcome.filter((r) => r.outcome !== "smooth").length;

  const wakeCounts = new Map<string, number>();
  for (const r of inRange) {
    const slot = wakeSlotOfTimeValue(r.wakeTime);
    if (slot) wakeCounts.set(slot.key, (wakeCounts.get(slot.key) ?? 0) + 1);
  }
  let commonWake: PeriodSummary["commonWake"] = null;
  for (const slot of WAKE_SLOTS) {
    const count = wakeCounts.get(slot.key) ?? 0;
    if (count > (commonWake?.count ?? 0)) commonWake = { label: slot.label, count };
  }
  const wakeCount = Array.from(wakeCounts.values()).reduce((a, b) => a + b, 0);

  return {
    from,
    to,
    total,
    reluctant,
    reluctantRate: total === 0 ? 0 : Math.round((reluctant / total) * 100),
    commonWake,
    wakeCount,
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
