import { DRAFT_STORAGE_KEY, notifyDraftChanged } from "@/lib/draft";
import type { Draft } from "./formState";

// 記録の途中でタイムラインなど他の画面を見に行っても、戻ってきたときに入力が消えていない
// よう localStorage に一時保存する(保存が完了したら消す使い捨ての下書き)。1枠のみ。
export function loadDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Draft;
    if (!draft?.form?.id || !draft.form.recordDate) return null;
    return { ...draft, initialPhotoIds: draft.initialPhotoIds ?? [] };
  } catch {
    return null;
  }
}

export function saveDraft(draft: Draft) {
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    notifyDraftChanged();
  } catch {
    // プライベートブラウジング等で書き込めない場合はあきらめる(入力自体は継続できる)
  }
}

export function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    notifyDraftChanged();
  } catch {
    // 同上
  }
}
