// 記録の対象日は日本時間(JST)で決める(SPEC §4)。端末のタイムゾーン設定に依存しない。
// あさノート・よるノートの @note/core/date は端末のタイムゾーンで「今日」を求めるため、ここでは使わない
// (日付の文字列 "YYYY-MM-DD" の加減算・表示は core と同じ形式)。

const JST_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 日本時間の今日("YYYY-MM-DD")。 */
export function todayJst(now: Date = new Date()): string {
  return JST_DATE.format(now);
}

/** 日本時間で今日より後か("YYYY-MM-DD" は文字列比較で前後が決まる)。DB も同じ基準で拒否する。 */
export function isFutureJst(date: string, now: Date = new Date()): boolean {
  return date > todayJst(now);
}

/** "YYYY-MM-DD" の形で、実在する日付か。 */
export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** 日付に日数を足す(暦の上の計算。タイムゾーンの影響を受けないよう UTC で計算する)。 */
export function addDaysToDate(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const next = new Date(Date.UTC(y, m - 1, d + delta));
  return next.toISOString().slice(0, 10);
}
