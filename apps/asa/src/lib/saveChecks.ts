// 保存前の確認(止めはしない)。朝の忙しい時間に入力を強いないため、保存はいつでもできる。
// ただし次の2つは後から気づきにくく、傾向画面の集計を静かにゆがめるので、保存の直前に1度だけ知らせる。
//  - 登校のない日(日曜・祝日)の記録: 「スムーズ」として数えられ、スムーズ率を押し上げる。
//  - 起床時刻・出発時刻の未入力: 起床時刻別の集計から外れる。
import { formatDateLabel, parseDateInputValue } from "@note/core/date";
import { getHolidayName } from "@note/core/holidays";
import type { Outcome } from "@/constants/choices";

interface SaveCheckInput {
  /** 記録する日付("YYYY-MM-DD")。 */
  date: string;
  outcome: Outcome | null;
  wakeTime: string;
  departTime: string;
}

export function collectSaveWarnings({ date, outcome, wakeTime, departTime }: SaveCheckInput): string[] {
  const warnings: string[] = [];

  const label = formatDateLabel(date);
  const holidayName = getHolidayName(date);
  const isSunday = parseDateInputValue(date).getDay() === 0;
  if (holidayName) {
    warnings.push(`${label}は祝日(${holidayName})です。登校のない日の記録は、スムーズ率などの集計に含まれます。`);
  } else if (isSunday) {
    warnings.push(`${label}は日曜日です。登校のない日の記録は、スムーズ率などの集計に含まれます。`);
  }

  if (!wakeTime) warnings.push("起床時刻が未入力です。");
  // 行かなかった日は出発しないので、出発時刻の未入力は指摘しない。
  if (!departTime && outcome !== "absent") warnings.push("出発時刻が未入力です。");

  return warnings;
}
