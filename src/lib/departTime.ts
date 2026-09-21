// 出発時刻は「8時より前 / 8時過ぎ / 8時半以降」の3択で記録する。朝の忙しい時間に
// 分単位の入力を求めない(そこまでの精度は振り返りに使っていない)ための割り切り。
//
// 保存先の `records.depart_time` は Postgres の time 型のままで、区分ごとの代表値
// (下の `value`)を書き込み、表示するときに時刻から区分へ引き直す。専用の列を足すと
// スキーマ変更と型の再生成が必要になるため、既存の列に載せている。
// 旧データや別端末で入った任意の時刻(例 "07:08")も、同じ境界で3区分のどれかへ寄せて
// 表示する。保存した値を読み直すと必ず元の区分に戻る(往復して区分がずれない)。
import { parseTimeToMinutes } from "./date";

export interface DepartSlot {
  key: string;
  label: string;
  /** この区分を選んだときに保存する代表値("HH:MM")。 */
  value: string;
  /** 0時からの分数がこの値未満なら、この区分とみなす。 */
  untilMinutes: number;
}

export const DEPART_SLOTS: DepartSlot[] = [
  { key: "before-0800", label: "8時より前", value: "07:59", untilMinutes: 8 * 60 },
  { key: "after-0800", label: "8時過ぎ", value: "08:15", untilMinutes: 8 * 60 + 30 },
  { key: "after-0830", label: "8時半以降", value: "08:30", untilMinutes: Number.POSITIVE_INFINITY },
];

// 保存されている時刻がどの区分に当たるか。未入力・想定外の値はnull(区分なし)。
export function slotOfTimeValue(value: string | null | undefined): DepartSlot | null {
  if (!value) return null;
  const minutes = parseTimeToMinutes(value);
  if (minutes === null) return null;
  return DEPART_SLOTS.find((slot) => minutes < slot.untilMinutes) ?? null;
}

// 日記文・プレビューで使う表示名。未入力・想定外の値はnull(その節を出さない)。
export function departTimeLabel(value: string | null | undefined): string | null {
  return slotOfTimeValue(value)?.label ?? null;
}
