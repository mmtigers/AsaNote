import { milestoneDisplay } from "@/lib/timeBands";
import { DINNER_OPTIONS, EFFECT_OPTIONS, MILESTONES, OUTCOME_OPTIONS } from "@/constants/choices";
import { parseDateInputValue, WEEKDAYS } from "@note/core/date";
import type { LocalRecord } from "@/lib/db/localDb";
import { isOwnRecord } from "@note/core/ownership";

interface SelectEntriesOptions {
  startDate: string;
  endDate: string;
  // null は「すべての子ども」。
  childId: string | null;
  includePartner: boolean;
  currentUserId: string | null | undefined;
  authLoading?: boolean;
}

// エクスポート対象を絞り込む。様子が未選択(入力途中)の記録は出力する意味が薄いため除外し、
// 日付の古い順(時系列)に並べる。
export function selectExportEntries<T extends LocalRecord>(
  records: T[],
  { startDate, endDate, childId, includePartner, currentUserId, authLoading }: SelectEntriesOptions
): T[] {
  return records
    .filter((r) => r.outcome && r.recordDate >= startDate && r.recordDate <= endDate)
    .filter((r) => childId === null || r.childId === childId)
    .filter((r) => includePartner || isOwnRecord(r, currentUserId, authLoading))
    .sort((a, b) => a.recordDate.localeCompare(b.recordDate) || a.updatedAt.localeCompare(b.updatedAt));
}

// 印刷→「PDFとして保存」時にブラウザが document.title を保存ファイル名の候補にすることを利用し、
// 対象期間を含める。単日なら yorunote_YYYYMMDD、期間があれば yorunote_YYYYMMDD-YYYYMMDD。
// 拡張子は付けない(印刷用タイトルにそのまま使う。CSVは buildCsvFilename)。
export function buildExportFilename(startDate: string, endDate: string): string {
  const start = startDate.replaceAll("-", "");
  const end = endDate.replaceAll("-", "");
  return start === end ? `yorunote_${start}` : `yorunote_${start}-${end}`;
}

export function buildCsvFilename(startDate: string, endDate: string): string {
  return `${buildExportFilename(startDate, endDate)}.csv`;
}

const CSV_HEADER = [
  "日付",
  "曜日",
  "子ども",
  "様子",
  ...MILESTONES.map((m) => m.label),
  "夕食",
  "夕食の理由",
  "自由時間",
  "友達・予定",
  "きっかけ",
  "行動",
  "対応",
  "対応の効き具合",
  "からだ",
  "メモ",
  "写真(枚数)",
  "記録者",
];

// CSVのフィールド値をエスケープする(RFC4180相当)。カンマ・ダブルクォート・改行を含む値だけ
// ダブルクォートで囲み、内部のダブルクォートは二重化する。
// また、Excel等で開いたときに数式として実行されないよう、= + - @ やタブで始まる文字列は
// 先頭にシングルクォートを付ける(メモは自由記述のため)。
function escapeCsvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

interface CsvContext {
  currentUserId: string | null | undefined;
  authLoading?: boolean;
  childNames: ReadonlyMap<string, string>;
  photoCounts: ReadonlyMap<string, number>;
}

// エクスポート対象(selectExportEntries済み)をCSV形式の文字列に変換する。
// 印刷/PDFの日記形式とは別に、Excel等での並び替え・集計に向く列形式で出す。
// メールアドレス等は含めず、パートナーの記録は「パートナー」表示のみに留める。写真は枚数のみ。
export function buildCsvContent(entries: LocalRecord[], ctx: CsvContext): string {
  const rows = entries.map((r) => {
    const weekday = WEEKDAYS[parseDateInputValue(r.recordDate).getDay()] ?? "";
    return [
      r.recordDate,
      weekday,
      r.childId ? (ctx.childNames.get(r.childId) ?? "") : "",
      OUTCOME_OPTIONS.find((o) => o.value === r.outcome)?.label ?? "",
      ...MILESTONES.map((m) => milestoneDisplay(m.key, r.times[m.key])),
      DINNER_OPTIONS.find((d) => d.value === r.dinner)?.label ?? "",
      r.dinnerWhy.join("、"),
      r.free.join("、"),
      r.friend.join("、"),
      r.trigger.join("、"),
      r.behavior.join("、"),
      r.response.join("、"),
      EFFECT_OPTIONS.find((e) => e.value === r.responseEffect)?.label ?? "",
      r.body.join("、"),
      r.memo ?? "",
      String(ctx.photoCounts.get(r.id) ?? 0),
      isOwnRecord(r, ctx.currentUserId, ctx.authLoading) ? "自分" : "パートナー",
    ];
  });
  return [CSV_HEADER, ...rows].map((row) => row.map(escapeCsvField).join(",")).join("\r\n");
}

// CSVファイルのダウンロードを開始する。ブラウザAPI呼び出しは buildCsvContent(純粋関数、
// テスト対象)と分けておく。ExcelでのUTF-8文字化けを防ぐためBOMを付ける。
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([`﻿${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
