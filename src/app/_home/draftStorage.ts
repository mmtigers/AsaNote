import { DRAFT_STORAGE_KEY, notifyDraftChanged } from "@/lib/draft";
import type { Draft } from "./types";

// 記録の途中でタイムラインなど他の画面を見に行っても、戻ってきたときに入力が
// 消えていないようlocalStorageに一時保存する(保存が完了したら消す使い捨ての下書き)。
export function loadDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
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
