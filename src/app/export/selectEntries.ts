import { isOwnRecord } from "@/lib/db/groups";
import type { Outcome } from "@/constants/choices";

export interface ExportableRecord {
  recordDate: string;
  updatedAt: string;
  outcome?: Outcome | null;
  userId?: string | null;
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
