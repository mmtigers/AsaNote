// 日本の祝日判定(#3-1)。@holiday-jp/holiday_jp は内閣府の祝日データを元にした
// 静的データをパッケージ内に同梱しており、実行時のネットワーク通信が発生しない。
// オフラインファーストのこのアプリと相性がよいため、外部APIではなくこちらを使う。
import holidayJp from "@holiday-jp/holiday_jp";

interface HolidayEntry {
  date: string;
  name: string;
}

// パッケージの型は日付ごとのリテラル型で定義されているため、任意の"YYYY-MM-DD"で
// 引けるようRecordへキャストする。
const holidaysByDate = holidayJp.holidays as unknown as Record<string, HolidayEntry | undefined>;

// "YYYY-MM-DD" -> 祝日名。祝日でなければnull。
export function getHolidayName(dateValue: string): string | null {
  return holidaysByDate[dateValue]?.name ?? null;
}
