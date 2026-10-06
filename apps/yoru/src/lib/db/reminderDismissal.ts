"use client";

import { createLocalStorageStore } from "@/lib/localStorageStore";

// 「後で」を選んだ場合、その日のうちはアプリ内リマインドを再表示しない。
// 日付が変われば自動的に再度対象になる。
const store = createLocalStorageStore("yoru-note:reminderDismissedDate", "yoru-note:reminder-dismissed-changed");

export function dismissReminderForToday(today: string) {
  store.set(today);
}

export function useDismissedDate(): string | null {
  return store.use();
}
