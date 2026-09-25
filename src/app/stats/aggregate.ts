// 傾向タブ(#4)の集計ロジック。画面から切り離した純関数として置き、テストで固定する
// (件数の数え間違い・曜日のズレは画面がエラーにならず静かに嘘をつくため)。
import type { Outcome } from "@/constants/choices";
import { WEEKDAYS, parseDateInputValue, parseTimeToMinutes } from "@/lib/date";

// 集計に必要なフィールドだけを要求する(テストで最小のオブジェクトを渡せるようにするため)。
export interface AggregatableRecord {
  recordDate: string; // "YYYY-MM-DD"
  updatedAt: string;
  outcome?: Outcome | null;
  wakeTime: string | null; // "HH:MM"
}

// カレンダー表示用: 日付 -> その日の結果。
// 同じ日に複数件ある(子どもが複数・パートナーも記録した)場合は最終更新が新しい方を採用する。
// ホーム画面のカレンダー(useRecordStatusForMonth)と同じ畳み方に揃えてある。
export function outcomeByDate(records: AggregatableRecord[]): Map<string, Outcome> {
  const latest = new Map<string, { outcome: Outcome; updatedAt: string }>();
  for (const r of records) {
    if (!r.outcome) continue; // 結果が未選択の記録は色を付けない
    const current = latest.get(r.recordDate);
    if (!current || r.updatedAt.localeCompare(current.updatedAt) > 0) {
      latest.set(r.recordDate, { outcome: r.outcome, updatedAt: r.updatedAt });
    }
  }
  return new Map(Array.from(latest, ([date, v]) => [date, v.outcome]));
}

export interface SmoothRateStat {
  key: string;
  label: string;
  total: number; // 結果を選んで記録した件数
  smooth: number; // そのうち「スムーズに行けた」件数
  rate: number; // smooth / total の百分率(四捨五入)
}

function toStat(key: string, label: string, total: number, smooth: number): SmoothRateStat {
  return { key, label, total, smooth, rate: total === 0 ? 0 : Math.round((smooth / total) * 100) };
}

// 曜日別のスムーズ率。記録が1件も無い曜日(休日など)は行ごと省く。
// 並びは WEEKDAYS(日→土)に従う。
export function smoothRateByWeekday(records: AggregatableRecord[]): SmoothRateStat[] {
  const totals = WEEKDAYS.map((label, day) => ({ key: String(day), label, total: 0, smooth: 0 }));
  for (const r of records) {
    if (!r.outcome) continue;
    const bucket = totals[parseDateInputValue(r.recordDate).getDay()];
    if (!bucket) continue; // getDay()は0〜6なので実際には起きない
    bucket.total += 1;
    if (r.outcome === "smooth") bucket.smooth += 1;
  }
  return totals.filter((t) => t.total > 0).map((t) => toStat(t.key, t.label, t.total, t.smooth));
}

// smoothRateByWeekdayの各行(key=曜日index)に該当する記録一覧(#3-3の詳細表示用)。
// 集計と対象を必ず揃えるため、同じ「結果を選んで記録した件数」の条件(r.outcomeがある)で絞る。
export function recordsForWeekday<T extends AggregatableRecord>(records: T[], weekdayKey: string): T[] {
  const weekday = Number(weekdayKey);
  return records.filter((r) => !!r.outcome && parseDateInputValue(r.recordDate).getDay() === weekday);
}

// 起床時刻の区切り(分)。`until`は「その値未満」を意味する上限。
// 小学生の登校時刻から逆算した30分刻み。増やす/減らす場合はここだけ触ればよい。
const WAKE_TIME_BUCKETS = [
  { key: "before-0630", label: "〜6:29", until: 6 * 60 + 30 },
  { key: "0630-0659", label: "6:30〜6:59", until: 7 * 60 },
  { key: "0700-0729", label: "7:00〜7:29", until: 7 * 60 + 30 },
  { key: "after-0730", label: "7:30〜", until: Number.POSITIVE_INFINITY },
] as const;

// 起床時刻(分)がどの区分に入るか。未入力・壊れた値はnull。
// smoothRateByWakeTimeとrecordsForWakeTimeBucketで判定がずれないよう、ここに集約する。
function wakeTimeBucketKey(wakeTime: string | null): string | null {
  if (!wakeTime) return null;
  const minutes = parseTimeToMinutes(wakeTime);
  if (minutes === null) return null;
  const bucket = WAKE_TIME_BUCKETS.find((b) => minutes < b.until);
  return bucket?.key ?? null; // 最後のバケットが Infinity なので通常はnullにならない
}

// 起床時刻の早さとスムーズ率の関係。起床時刻を入力していない記録は対象外。
// 記録が1件も無い時間帯は行ごと省く。
export function smoothRateByWakeTime(records: AggregatableRecord[]): SmoothRateStat[] {
  const totals = WAKE_TIME_BUCKETS.map((b) => ({ key: b.key, label: b.label, total: 0, smooth: 0 }));
  for (const r of records) {
    if (!r.outcome) continue;
    const key = wakeTimeBucketKey(r.wakeTime);
    const bucket = totals.find((t) => t.key === key);
    if (!bucket) continue;
    bucket.total += 1;
    if (r.outcome === "smooth") bucket.smooth += 1;
  }
  return totals.filter((t) => t.total > 0).map((t) => toStat(t.key, t.label, t.total, t.smooth));
}

// smoothRateByWakeTimeの各行(key=バケットkey)に該当する記録一覧(#3-3の詳細表示用)。
export function recordsForWakeTimeBucket<T extends AggregatableRecord>(records: T[], bucketKey: string): T[] {
  return records.filter((r) => !!r.outcome && wakeTimeBucketKey(r.wakeTime) === bucketKey);
}
