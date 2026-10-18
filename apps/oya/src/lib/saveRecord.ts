import { MEMO_MAX_LENGTH } from "@/constants/choices";
import { completeOwnRecord, upsertOwnRecord, type DailyRecord, type DailyRecordInput, type RevealedPhoto } from "@/lib/db/records";
import { isFutureJst, isValidDateString } from "@/lib/jst";
import { clearDraft, saveDraft } from "@/lib/recordDraft";

// 記録の保存と完了の流れ(SPEC §4.2)。
//   1. 入力を下書きとして端末に残す(この後どこで失敗しても、入力を失わない)。
//   2. サーバーへ保存する(1人1日1件の upsert)。失敗したら例外を投げる。下書きは残り、そのまま再試行できる。
//   3. 保存に成功したら下書きを消す(記録の正はサーバー)。
//   4. 完了の操作なら、保存の成功を確かめた後にだけ complete_oya_record() を呼ぶ。完了に失敗しても、記録は保存済み。
//      完了は何度呼んでも同じ結果なので、そのまま再試行できる。

export class RecordValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecordValidationError";
  }
}

export type SaveOutcome =
  | { status: "saved"; record: DailyRecord }
  | { status: "completed"; record: DailyRecord; completedAt: string; photo: RevealedPhoto | null }
  /** 記録は保存できたが、完了にできなかった(もう一度「完了」を押せばよい)。 */
  | { status: "saved-not-completed"; record: DailyRecord; error: unknown };

/** サーバーへ送る前の検証(サーバーも同じ内容を検証する)。 */
export function validateRecord(recordDate: string, input: DailyRecordInput, now: Date = new Date()): void {
  if (!isValidDateString(recordDate)) throw new RecordValidationError("日付が正しくありません。");
  if (isFutureJst(recordDate, now)) throw new RecordValidationError("未来の日付には記録できません。");
  if (input.memo.trim().length > MEMO_MAX_LENGTH) {
    throw new RecordValidationError(`メモは${MEMO_MAX_LENGTH}文字までです。`);
  }
}

export async function saveDailyRecord(params: {
  userId: string;
  familyId: string;
  recordDate: string;
  input: DailyRecordInput;
  /** true なら、保存の後に完了にする(「完了」ボタン)。false は途中保存。 */
  complete: boolean;
  now?: Date;
}): Promise<SaveOutcome> {
  const { userId, familyId, recordDate, input, complete } = params;
  validateRecord(recordDate, input, params.now);

  saveDraft(userId, recordDate, input, params.now);
  const record = await upsertOwnRecord({ userId, familyId, recordDate, input });
  clearDraft(userId, recordDate);

  if (!complete) return { status: "saved", record };

  try {
    const { completedAt, photo } = await completeOwnRecord(recordDate);
    return { status: "completed", record: { ...record, completedAt }, completedAt, photo };
  } catch (error) {
    return { status: "saved-not-completed", record, error };
  }
}
