// 傾向タブの各項目タップ時の詳細表示(#3-3)で使う集計ロジック。画面から切り離した
// 純関数として置き、テストで固定する(aggregate.tsと同じ方針)。
import { WEEKDAYS, parseDateInputValue } from "../date";

export type PeriodUnit = "day" | "week" | "month";

export interface TrendPoint {
  key: string; // ソート・React key用。day/weekは"YYYY-MM-DD"、monthは"YYYY-MM"。
  label: string; // 表示用ラベル。
  count: number;
}

interface DatedRecord {
  recordDate: string; // "YYYY-MM-DD"
}

// その週(日曜始まり)の日曜日の日付を返す。
function weekStartOf(recordDate: string): string {
  const d = parseDateInputValue(recordDate);
  d.setDate(d.getDate() - d.getDay());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function periodKey(recordDate: string, unit: PeriodUnit): string {
  if (unit === "day") return recordDate;
  if (unit === "week") return weekStartOf(recordDate);
  return recordDate.slice(0, 7);
}

function periodLabel(key: string, unit: PeriodUnit): string {
  if (unit === "month") {
    const [year, month] = key.split("-");
    return `${year}/${Number(month)}`;
  }
  const d = parseDateInputValue(key);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 日別/週別(日曜始まり)/月別の件数推移。件数が1件も無い期間は行を作らない
// (期間全体を等間隔で埋めると、記録が疎なタグほど横に間延びして読みにくいため)。
export function groupRecordsByPeriod<T extends DatedRecord>(records: T[], unit: PeriodUnit): TrendPoint[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    const key = periodKey(r.recordDate, unit);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, label: periodLabel(key, unit), count }));
}

export interface DetailStats {
  total: number;
  modeWeekdayLabel: string | null; // 最も多い曜日(同数1位が複数ある場合は最初に見つかったもの)。
  monthlyAverage: number; // 記録がある月ごとの平均件数(小数第1位まで)。
}

// 簡単な統計値: 件数・最頻曜日・月平均件数。
export function computeDetailStats<T extends DatedRecord>(records: T[]): DetailStats {
  const total = records.length;
  const weekdayCounts = new Array(7).fill(0) as number[];
  const months = new Set<string>();
  for (const r of records) {
    const day = parseDateInputValue(r.recordDate).getDay();
    weekdayCounts[day] = (weekdayCounts[day] ?? 0) + 1;
    months.add(r.recordDate.slice(0, 7));
  }

  let modeIndex = -1;
  let modeCount = 0;
  weekdayCounts.forEach((count, i) => {
    if (count > modeCount) {
      modeCount = count;
      modeIndex = i;
    }
  });

  return {
    total,
    modeWeekdayLabel: modeIndex >= 0 ? (WEEKDAYS[modeIndex] ?? null) : null,
    monthlyAverage: months.size > 0 ? Math.round((total / months.size) * 10) / 10 : 0,
  };
}
