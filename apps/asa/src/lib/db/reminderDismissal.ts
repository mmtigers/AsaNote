"use client";

import { createLocalStorageStore } from "@note/core/localStorageStore";

// 「今日はもう記録した/後で」を選んだ場合、その日のうちは再表示しない。
// 日付が変われば自動的に再度対象になる。
//
// 読み書き・通知・購読の定型は src/lib/localStorageStore.ts に共通化してある(#62)。
const store = createLocalStorageStore(
  "asa-note:reminderDismissedDate",
  "asa-note:reminder-dismissed-changed",
);

export function getDismissedDate(): string | null {
  return store.get();
}

export function dismissReminderForToday(today: string) {
  store.set(today);
}

// ログアウト時に消す(共有端末で、前の人の「後で」が次の人に効かないようにする。#131)。
export function clearReminderDismissal() {
  store.set(null);
}

export function useDismissedDate(): string | null {
  return store.use();
}
