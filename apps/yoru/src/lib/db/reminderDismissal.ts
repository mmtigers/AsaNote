"use client";

import { createLocalStorageStore } from "@note/core/localStorageStore";

// 「後で」を選んだ場合、その日のうちはアプリ内リマインドを再表示しない。
// 日付が変われば自動的に再度対象になる。
const store = createLocalStorageStore("yoru-note:reminderDismissedDate", "yoru-note:reminder-dismissed-changed");

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
