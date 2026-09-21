// 出発時刻("HH:MM")を「時」「分」の2つの選択肢へ分解・再構成するための純関数。
// 朝の忙しい時間に時刻をキーボードで打たせないための選択式入力(#10の起床時刻と同じ方針)。
//
// 分は入力の手間を減らすため5分刻みだが、旧データや別端末で入った5分刻みでない値
// (例 "07:08")を勝手に丸めて書き換えてしまわないよう、その値だけは選択肢に混ぜて残す。

const MINUTE_STEP = 5;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function hourOptions(): string[] {
  return Array.from({ length: 24 }, (_, h) => pad2(h));
}

// current に5分刻みでない値が入っている場合だけ、その値を時刻順の正しい位置に足す。
export function minuteOptions(current?: string): string[] {
  const base = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => pad2(i * MINUTE_STEP));
  if (!current || base.includes(current)) return base;
  if (!/^[0-5][0-9]$/.test(current)) return base;
  return [...base, current].sort();
}

// "HH:MM" を時・分に分ける。空・想定外の値は未選択(両方とも空文字)として扱う。
export function splitTimeValue(value: string): { hour: string; minute: string } {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!matched) return { hour: "", minute: "" };
  const hour = Number(matched[1]);
  const minute = Number(matched[2]);
  if (hour > 23 || minute > 59) return { hour: "", minute: "" };
  return { hour: pad2(hour), minute: pad2(minute) };
}

// 時が未選択なら時刻そのものを未入力に戻す(「クリア」の意味)。
// 時だけ選んで分が未選択のときは0分として扱う(分をもう一度選ばせない)。
export function joinTimeValue(hour: string, minute: string): string {
  if (!hour) return "";
  return `${hour}:${minute || "00"}`;
}
