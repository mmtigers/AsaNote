// "YYYY-MM-DD"形式の日付文字列(<input type="date">の値やDB保存値)を扱う
// 共通ユーティリティ。日本語ローカル環境での利用のみを想定したアプリのため、
// 常にローカルタイムゾーン(JST)として解釈する。
//
// 単に `new Date(value)` すると "YYYY-MM-DD" はUTC 0時として解釈され、
// JST(UTC+9)環境では前日の日付として扱われてしまう(致命的な1日ズレ)。
// これを防ぐため、日付のパースは必ずこのparseDateInputValueを経由すること。
// 曜日ラベルの唯一の情報源(#62)。以前は MonthCalendar.tsx にも同じ配列があり、
// 片方だけ直すと表示が食い違う状態だった。Date#getDay() の戻り値(0=日)を
// そのまま添字に使える並びであることが前提なので、順序を変えないこと。
export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

export function parseDateInputValue(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

export function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 記録画面のヘッダー等で使う表記("9月14日(月)")。
export function formatDateLabel(value: string): string {
  const d = parseDateInputValue(value);
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})`;
}

// タイムラインの一覧項目のような、より簡潔な表記("9/14(月)")。
export function formatDateShort(value: string): string {
  const d = parseDateInputValue(value);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

export function toMonthOf(value: string): { year: number; month: number } {
  const d = parseDateInputValue(value);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function addDays(value: string, delta: number): string {
  const d = parseDateInputValue(value);
  d.setDate(d.getDate() + delta);
  return toDateInputValue(d);
}
