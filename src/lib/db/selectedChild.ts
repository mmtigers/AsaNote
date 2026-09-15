"use client";

import { useSyncExternalStore } from "react";

// ホーム画面で最後に選んだ「今どの子どもを記録しているか」を端末に覚えておく
// (src/lib/draft.tsと同じuseSyncExternalStoreパターン)。タイムライン・傾向側の
// 絞り込みは各ページのローカルstateで別管理し、常に「すべて」から始める
// (この値をそのまま使うと、子ども追加直後に他の子の過去記録が急に見えなくなるため)。
const SELECTED_CHILD_KEY = "asa-note:selectedChildId";
const SELECTED_CHILD_CHANGED_EVENT = "asa-note:selected-child-changed";

export function getSelectedChildId(): string | null {
  try {
    return window.localStorage.getItem(SELECTED_CHILD_KEY);
  } catch {
    return null;
  }
}

export function setSelectedChildId(id: string | null) {
  try {
    if (id) window.localStorage.setItem(SELECTED_CHILD_KEY, id);
    else window.localStorage.removeItem(SELECTED_CHILD_KEY);
    window.dispatchEvent(new Event(SELECTED_CHILD_CHANGED_EVENT));
  } catch {
    // プライベートブラウジング等で書き込めない場合はあきらめる(選択自体は継続できる)
  }
}

function subscribe(callback: () => void) {
  window.addEventListener(SELECTED_CHILD_CHANGED_EVENT, callback);
  return () => window.removeEventListener(SELECTED_CHILD_CHANGED_EVENT, callback);
}

export function useSelectedChildId(): string | null {
  return useSyncExternalStore(subscribe, getSelectedChildId, () => null);
}
