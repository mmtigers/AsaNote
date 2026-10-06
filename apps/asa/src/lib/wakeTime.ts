// 起床時刻は「7時より前 / 7時〜7時15分 / 7時15分〜」の3択で記録する。出発時刻
// (departTime.ts)と同じ方針で、保存先の `records.wake_time`(time 型)に区分ごとの
// 代表値を書き込み、表示するときに時刻から区分へ引き直す。専用の列は足さない。
import { parseTimeToMinutes } from "@note/core/date";

export interface WakeSlot {
  key: string;
  label: string;
  /** この区分を選んだときに保存する代表値("HH:MM")。 */
  value: string;
  /** 0時からの分数がこの値未満なら、この区分とみなす。 */
  untilMinutes: number;
}

export const WAKE_SLOTS: WakeSlot[] = [
  { key: "before-0700", label: "7時より前", value: "06:59", untilMinutes: 7 * 60 },
  { key: "0700-0715", label: "7時〜7時15分", value: "07:08", untilMinutes: 7 * 60 + 15 },
  { key: "after-0715", label: "7時15分〜", value: "07:15", untilMinutes: Number.POSITIVE_INFINITY },
];

// 保存されている時刻がどの区分に当たるか。未入力・想定外の値はnull(区分なし)。
export function wakeSlotOfTimeValue(value: string | null | undefined): WakeSlot | null {
  if (!value) return null;
  const minutes = parseTimeToMinutes(value);
  if (minutes === null) return null;
  return WAKE_SLOTS.find((slot) => minutes < slot.untilMinutes) ?? null;
}

// タイムライン・CSVで使う表示名。未入力・想定外の値はnull(その節を出さない)。
export function wakeTimeLabel(value: string | null | undefined): string | null {
  return wakeSlotOfTimeValue(value)?.label ?? null;
}
