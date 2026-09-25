import { isOwnRecord } from "@/lib/db/ownership";
import { OUTCOME_OPTIONS, type Outcome } from "@/constants/choices";
import { departTimeLabel } from "@/lib/departTime";
import { parseDateInputValue, WEEKDAYS } from "@/lib/date";

export interface ExportableRecord {
  recordDate: string;
  updatedAt: string;
  outcome?: Outcome | null;
  userId?: string | null;
}

export interface CsvableRecord extends ExportableRecord {
  wakeTime: string | null;
  departTime: string | null;
  memo: string | null;
  wakeTags: string[];
  triggerTags: string[];
  reasonTags: string[];
  responseTags: string[];
}

interface SelectEntriesOptions {
  startDate: string;
  endDate: string;
  includePartner: boolean;
  currentUserId: string | null | undefined;
  authLoading?: boolean;
}

// エクスポート対象を絞り込む。outcome未設定(入力途中)の記録は日記として
// 出力する意味が薄いため除外し、日付の古い順(時系列)に並べる。
export function selectExportEntries<T extends ExportableRecord>(
  records: T[],
  { startDate, endDate, includePartner, currentUserId, authLoading }: SelectEntriesOptions
): T[] {
  return records
    .filter((r) => r.outcome && r.recordDate >= startDate && r.recordDate <= endDate)
    .filter((r) => includePartner || isOwnRecord(r, currentUserId, authLoading))
    .sort((a, b) => a.recordDate.localeCompare(b.recordDate) || a.updatedAt.localeCompare(b.updatedAt));
}

// エクスポートファイル名(#2-2)。「印刷する」→「PDFとして保存」時にブラウザが
// document.title を保存ファイル名の候補にすることを利用し、対象期間を含める。
// 単日なら asanote_YYYYMMDD、期間があれば asanote_YYYYMMDD-YYYYMMDD。
export function buildExportFilename(startDate: string, endDate: string): string {
  const start = startDate.replaceAll("-", "");
  const end = endDate.replaceAll("-", "");
  return start === end ? `asanote_${start}.csv` : `asanote_${start}-${end}.csv`;
}

const CSV_HEADER = ["日付", "曜日", "結果", "起床時刻", "出発時刻", "タグ", "メモ", "記録者"];

// CSVのフィールド値をエスケープする(RFC4180相当)。カンマ・ダブルクォート・改行を
// 含む値だけダブルクォートで囲み、内部のダブルクォートは二重化する。
function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// エクスポート対象(selectExportEntries済み)をCSV形式の文字列に変換する(#4-2)。
// 学校等への共有を想定した日記形式の印刷/PDF出力(buildDiaryText)とは別に、
// Excel等での並び替え・集計に向く列形式で出す。パートナーの記録も
// メールアドレス等は含めず「パートナー」表示のみに留める(印刷出力と同じ方針)。
export function buildCsvContent<T extends CsvableRecord>(
  entries: T[],
  currentUserId: string | null | undefined,
  authLoading?: boolean
): string {
  const rows = entries.map((record) => {
    const weekday = WEEKDAYS[parseDateInputValue(record.recordDate).getDay()] ?? "";
    const outcomeLabel = OUTCOME_OPTIONS.find((o) => o.value === record.outcome)?.label ?? "";
    const tags = [...record.wakeTags, ...record.triggerTags, ...record.reasonTags, ...record.responseTags];
    const owner = isOwnRecord(record, currentUserId, authLoading) ? "自分" : "パートナー";
    return [
      record.recordDate,
      weekday,
      outcomeLabel,
      record.wakeTime ?? "",
      departTimeLabel(record.departTime) ?? "",
      tags.join("、"),
      record.memo ?? "",
      owner,
    ];
  });
  return [CSV_HEADER, ...rows].map((row) => row.map(escapeCsvField).join(",")).join("\r\n");
}

// CSVファイルのダウンロードを開始する。ブラウザAPI呼び出しをbuildCsvContent(純粋関数、
// テスト対象)と分けておく(push.tsと同じ方針)。ExcelでのUTF-8文字化けを防ぐためBOMを付ける。
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([`﻿${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
