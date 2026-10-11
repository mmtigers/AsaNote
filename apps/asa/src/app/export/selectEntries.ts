import { matchesChildFilter } from "@note/core/childFilter";
import { isOwnRecord } from "@note/core/ownership";
import { OUTCOME_OPTIONS, type Outcome } from "@/constants/choices";
import { departTimeLabel } from "@/lib/departTime";
import { wakeTimeLabel } from "@/lib/wakeTime";
import { parseDateInputValue, WEEKDAYS } from "@note/core/date";

export interface ExportableRecord {
  recordDate: string;
  updatedAt: string;
  outcome?: Outcome | null;
  userId?: string | null;
  childId?: string | null;
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
  // 子どもの絞り込み(#127)。null/省略は「すべて」、UNASSIGNED_FILTER は子ども未分類の記録だけ。
  childFilter?: string | null;
  currentUserId: string | null | undefined;
  authLoading?: boolean;
}

// エクスポート対象を絞り込む。outcome未設定(入力途中)の記録は日記として
// 出力する意味が薄いため除外し、日付の古い順(時系列)に並べる。
export function selectExportEntries<T extends ExportableRecord>(
  records: T[],
  { startDate, endDate, includePartner, childFilter = null, currentUserId, authLoading }: SelectEntriesOptions
): T[] {
  return records
    .filter((r) => r.outcome && r.recordDate >= startDate && r.recordDate <= endDate)
    .filter((r) => matchesChildFilter(r.childId, childFilter))
    .filter((r) => includePartner || isOwnRecord(r, currentUserId, authLoading))
    .sort((a, b) => a.recordDate.localeCompare(b.recordDate) || a.updatedAt.localeCompare(b.updatedAt));
}

// エクスポートファイル名(#2-2)。「印刷する」→「PDFとして保存」時にブラウザが
// document.title を保存ファイル名の候補にすることを利用し、対象期間を含める。
// 単日なら asanote_YYYYMMDD、期間があれば asanote_YYYYMMDD-YYYYMMDD。
// 拡張子は付けない(印刷用タイトルにそのまま使う。CSVは buildCsvFilename)。
export function buildExportFilename(startDate: string, endDate: string): string {
  const start = startDate.replaceAll("-", "");
  const end = endDate.replaceAll("-", "");
  return start === end ? `asanote_${start}` : `asanote_${start}-${end}`;
}

export function buildCsvFilename(startDate: string, endDate: string): string {
  return `${buildExportFilename(startDate, endDate)}.csv`;
}

const CSV_HEADER = ["日付", "曜日", "結果", "起床時刻", "出発時刻", "タグ", "メモ", "記録者", "子ども"];

// CSVのフィールド値をエスケープする(RFC4180相当)。カンマ・ダブルクォート・改行を
// 含む値だけダブルクォートで囲み、内部のダブルクォートは二重化する。
function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// エクスポート対象(selectExportEntries済み)をCSV形式の文字列に変換する(#4-2)。
// 学校等への共有を想定した日記形式の印刷/PDF出力(buildDiaryText)とは別に、
// Excel等での並び替え・集計に向く列形式で出す。パートナーの記録も
// メールアドレス等は含めず「パートナー」表示のみに留める(印刷出力と同じ方針)。
// 「子ども」列は既存の列の位置を変えないよう末尾に置き、子ども未分類の記録は空にする(#127)。
// 子どもが1人以下の家庭では呼び出し側が childNames を渡さず、列は出すが空になる(列構成を家庭で変えない)。
export function buildCsvContent<T extends CsvableRecord>(
  entries: T[],
  currentUserId: string | null | undefined,
  authLoading?: boolean,
  childNames: ReadonlyMap<string, string> = new Map()
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
      wakeTimeLabel(record.wakeTime) ?? "",
      departTimeLabel(record.departTime) ?? "",
      tags.join("、"),
      record.memo ?? "",
      owner,
      record.childId ? (childNames.get(record.childId) ?? "") : "",
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
