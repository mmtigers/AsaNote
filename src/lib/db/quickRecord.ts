import { MEMO_MAX_LENGTH, type Outcome } from "@/constants/choices";
import { emptyForm, formToInput } from "@/app/_home/formState";
import { findLatestOwnRecordForDate, saveRecord } from "./records";

export type QuickOutcome = Extract<Outcome, "rough" | "storm">;

const SEVERITY: Record<Outcome, number> = { calm: 0, rough: 1, storm: 2 };
const LABEL: Record<QuickOutcome, string> = { rough: "少し荒れた", storm: "大荒れ" };

export function formatClock(now: Date): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

// メモの末尾に「HH:MM 荒れた」の1行を足す。上限を超える分は古い行から捨てる(新しい行を優先)。
export function appendQuickLine(memo: string | null, clock: string, outcome: QuickOutcome): string {
  const line = `${clock} ${LABEL[outcome]}`;
  const next = memo?.trim() ? `${memo.trimEnd()}\n${line}` : line;
  return next.length <= MEMO_MAX_LENGTH ? next : next.slice(next.length - MEMO_MAX_LENGTH);
}

// 夜の最中のワンタップ記録。その日の自分の記録があれば様子を重い方へ更新してメモへ時刻付きで追記し、
// 無ければ新規に作る。詳細は後から通常の編集画面で足せる。
export async function saveQuickRecord(params: {
  outcome: QuickOutcome;
  recordDate: string;
  userId: string | null;
  childId: string | null;
  now?: Date;
}): Promise<void> {
  const { outcome, recordDate, userId, childId, now = new Date() } = params;
  const clock = formatClock(now);
  const existing = await findLatestOwnRecordForDate(recordDate, userId, childId);

  if (existing) {
    const worse = existing.outcome && SEVERITY[existing.outcome] >= SEVERITY[outcome] ? existing.outcome : outcome;
    await saveRecord({
      ...existing,
      outcome: worse,
      memo: appendQuickLine(existing.memo, clock, outcome),
    });
    return;
  }

  const form = emptyForm(recordDate, childId);
  await saveRecord(formToInput({ ...form, outcome, memo: appendQuickLine(null, clock, outcome) }, userId));
}
