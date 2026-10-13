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

// fromから見たtoの日数差(未来ならプラス、過去ならマイナス)。計測イベントの
// date_offset_days(今日=0、過去日の記録・編集はマイナス)に使う。
export function diffInDays(from: string, to: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((parseDateInputValue(to).getTime() - parseDateInputValue(from).getTime()) / msPerDay);
}

// 記録できない未来日かどうか(#134)。どちらも toDateInputValue 形式("YYYY-MM-DD"、ゼロ埋め)
// なので文字列比較で日付の前後が決まる。today は呼び出し側が toDateInputValue(new Date()) で
// 求めたローカル(JST)の今日を渡す(UTCで求めると日付が変わる瞬間にずれる)。
export function isFutureDate(value: string, today: string): boolean {
  return value > today;
}

// URLの?date=など外から渡された日付を、記録できる範囲(今日まで)に丸める。
// 未来日、および"YYYY-MM-DD"として読めない値は今日にする。過去日はそのまま返す。
export function clampToToday(value: string, today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return today;
  return isFutureDate(value, today) ? today : value;
}

// "HH:MM" を0時からの分数に変換する。想定外の値(旧データ・手入力の崩れ)はnullを返す。
// 出発時刻の区分判定(departTime.ts)と、傾向タブの起床時刻の集計(stats/aggregate.ts)の
// 両方が使う唯一の情報源。
export function parseTimeToMinutes(value: string): number | null {
  const matched = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!matched) return null;
  const hours = Number(matched[1]);
  const minutes = Number(matched[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

// #226 の確認用(CI の動作確認。マージしない)。
