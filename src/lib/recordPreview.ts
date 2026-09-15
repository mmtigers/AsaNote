import { OUTCOME_OPTIONS, type Outcome } from "@/constants/choices";

export interface DiaryTextSource {
  outcome?: Outcome | null;
  reasonTags: string[];
  departTime: string | null;
  memo: string | null;
}

// 記録内容から自動生成する日記文。記録フォームのプレビュー(src/app/_home/useRecordForm.ts)と
// エクスポート機能(src/app/export/page.tsx)の両方で使う唯一の情報源。
export function buildDiaryText(record: DiaryTextSource): string {
  if (!record.outcome) return "";
  const outcomeLabel = OUTCOME_OPTIONS.find((o) => o.value === record.outcome)?.label ?? "";
  const segs: string[] = [outcomeLabel];
  if (record.reasonTags.length) segs.push(`理由は「${record.reasonTags.join("・")}」`);
  if (record.departTime) segs.push(`${record.departTime}に出発`);
  if (record.memo) segs.push(record.memo);
  return segs.join("。") + "。";
}
