// 連絡メモの下書き(docs/liaison-memo.md)の、画面で使う計算。DB や React に依存しないので、単体でテストする。
// 日付は日本時間の "YYYY-MM-DD"。回の決め方は Edge Function(supabase/functions/_shared/liaisonSchedule.ts)と同じ。

export const MAX_REGENERATIONS = 3;
export const MEMO_TEXT_MAX = 2000;
export const CONTACT_TEXT_MAX = 500;
export const INSTRUCTION_MAX = 100;
export const STYLE_EXAMPLE_MAX = 400;
export const STYLE_EXAMPLES_MAX_COUNT = 3;
export const RECIPIENT_LABEL_MAX = 20;
export const TARGET_CHARS_OPTIONS = Array.from({ length: 26 }, (_, i) => 50 + i * 10); // 50〜300字(10字きざみ)
export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
// お知らせカードを出すのは、予定日から何日後までか(次の回が来たら消える)。
export const NOTICE_DAYS = 6;

export type MemoStatus = "generating" | "generated" | "no_records" | "failed";

export interface LiaisonSettings {
  childId: string;
  enabled: boolean;
  consentedBy: string | null;
  consentedAt: string | null;
  weekday: number; // 0=日〜6=土
  hour: number; // 0〜23(日本時間)
  targetChars: number;
  recipientLabel: string;
  includeMemo: boolean;
  styleExamples: string[];
  updatedBy: string | null;
  updatedAt: string | null;
}

export const DEFAULT_LIAISON_SETTINGS: Omit<LiaisonSettings, "childId"> = {
  enabled: false,
  consentedBy: null,
  consentedAt: null,
  weekday: 4,
  hour: 13,
  targetChars: 80,
  recipientLabel: "療育先",
  includeMemo: true,
  styleExamples: [],
  updatedBy: null,
  updatedAt: null,
};

export interface LiaisonMemo {
  id: string;
  childId: string;
  dueDate: string;
  status: MemoStatus;
  error: string | null;
  draftText: string | null;
  editedText: string | null;
  contactDraftText: string | null;
  contactEditedText: string | null;
  finalText: string | null;
  sentAt: string | null;
  sentBy: string | null;
  regenerateCount: number;
  asaFrom: string | null;
  asaTo: string | null;
  yoruFrom: string | null;
  yoruTo: string | null;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function jstToday(now: Date): string {
  return new Date(now.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

// 今の回の予定日: 今日以降で、設定の曜日に当たる最も近い日(今日が当たるなら今日)。
export function upcomingDueDate(now: Date, weekday: number): string {
  const today = jstToday(now);
  return addDays(today, (weekday - weekdayOf(today) + 7) % 7);
}

// 今の回の行(無ければ null)。予定日ちょうどの行を「今の回」とする。
export function currentMemo(memos: LiaisonMemo[], now: Date, weekday: number): LiaisonMemo | null {
  const due = upcomingDueDate(now, weekday);
  return memos.find((m) => m.dueDate === due) ?? null;
}

// 画面で表示・編集する本文(編集があれば編集、無ければ下書き)。
export function memoBody(memo: Pick<LiaisonMemo, "editedText" | "draftText">): string {
  return memo.editedText ?? memo.draftText ?? "";
}

export function contactBody(memo: Pick<LiaisonMemo, "contactEditedText" | "contactDraftText">): string {
  return memo.contactEditedText ?? memo.contactDraftText ?? "";
}

// 履歴に出す本文(最終版 → 編集 → 下書き)。
export function historyBody(memo: LiaisonMemo): string {
  return memo.finalText ?? memoBody(memo);
}

// 改行・空白を除いた文字数(Edge Function の数え方と同じ)。
export function countChars(text: string): number {
  const compact = text.replace(/\s+/g, "");
  return [...new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(compact)].length;
}

// ホームのお知らせカードに出すか(仕様 §7)。下書きがあって「送った」にしていない、または失敗した回を、
// 予定日から NOTICE_DAYS 日後まで出す。
export function shouldShowNotice(memo: LiaisonMemo | null, now: Date): boolean {
  if (!memo) return false;
  const today = jstToday(now);
  if (today < memo.dueDate || today > addDays(memo.dueDate, NOTICE_DAYS)) return false;
  if (memo.status === "failed") return true;
  return memo.status === "generated" && !memo.sentAt;
}

// 直近のメモの中から、お知らせを出す回(予定日が新しいものを優先)。
export function noticeMemo(memos: LiaisonMemo[], now: Date): LiaisonMemo | null {
  return [...memos].sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1)).find((m) => shouldShowNotice(m, now)) ?? null;
}

export function formatPeriod(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return `${md(from)}〜${md(to)}`;
}
