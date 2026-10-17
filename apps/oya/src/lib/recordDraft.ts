import { EMPTY_INPUT, type DailyRecordInput } from "@/lib/db/records";
import { APP_ID } from "@/lib/appConfig";

// 入力途中の記録(下書き)を、この端末の localStorage に持つ(SPEC §4.2「途中保存」「保存失敗時は入力を保持」)。
// 記録の正はサーバー。下書きは「サーバーへの保存がまだ成功していない入力」を失わないためだけに使い、保存に成功したら消す。
// キーは利用者と日付ごと(共有の端末で、別の人・別の日の入力と混ざらないように)。
// プライベートブラウズなどで localStorage が使えないときは、何もしない(画面の入力は残る)。

export interface RecordDraft {
  input: DailyRecordInput;
  savedAt: string;
}

const PREFIX = `${APP_ID}:draft:`;

export function draftKey(userId: string, recordDate: string): string {
  return `${PREFIX}${userId}:${recordDate}`;
}

export function saveDraft(userId: string, recordDate: string, input: DailyRecordInput, now: Date = new Date()): void {
  try {
    const draft: RecordDraft = { input, savedAt: now.toISOString() };
    window.localStorage.setItem(draftKey(userId, recordDate), JSON.stringify(draft));
  } catch {
    // 保存できなくても、画面の入力はそのまま残る。
  }
}

export function loadDraft(userId: string, recordDate: string): RecordDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(userId, recordDate));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RecordDraft>;
    if (!parsed || typeof parsed !== "object" || !parsed.input || typeof parsed.savedAt !== "string") return null;
    // 古い形の下書きでも読めるよう、足りない項目は未入力で埋める。
    return { input: { ...EMPTY_INPUT, ...parsed.input }, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function clearDraft(userId: string, recordDate: string): void {
  try {
    window.localStorage.removeItem(draftKey(userId, recordDate));
  } catch {
    // 何もしない。
  }
}

/** ログアウト時などに、この端末のおやノートの下書きをすべて消す(共有の端末で、次の人に残さない)。 */
export function clearAllDrafts(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
  } catch {
    // 何もしない。
  }
}
