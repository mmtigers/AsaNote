import { toDateInputValue } from "@note/core/date";

/** 端末の日付での今日("YYYY-MM-DD")。日本での利用を前提とする(@note/core/date と同じ考え方)。 */
export function todayString(): string {
  return toDateInputValue(new Date());
}
