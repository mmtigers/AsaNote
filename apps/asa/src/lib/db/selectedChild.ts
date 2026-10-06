"use client";

import { createLocalStorageStore } from "@/lib/localStorageStore";

// ホーム画面で最後に選んだ「今どの子どもを記録しているか」を端末に覚えておく。
// タイムライン・傾向側の絞り込みは各ページのローカルstateで別管理し、常に「すべて」
// から始める(この値をそのまま使うと、子ども追加直後に他の子の過去記録が急に
// 見えなくなるため)。
//
// 読み書き・通知・購読の定型は src/lib/localStorageStore.ts に共通化してある(#62)。
const store = createLocalStorageStore("asa-note:selectedChildId", "asa-note:selected-child-changed");

export function getSelectedChildId(): string | null {
  return store.get();
}

// 空文字は「未選択」と同じ扱いで消す(子どものidが空文字になることはない)。
export function setSelectedChildId(id: string | null) {
  store.set(id || null);
}

export function useSelectedChildId(): string | null {
  return store.use();
}
