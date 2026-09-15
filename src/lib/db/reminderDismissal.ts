"use client";

import { useSyncExternalStore } from "react";

// 「今日はもう記録した/後で」を選んだ場合、その日のうちは再表示しない
// (src/lib/db/syncStatus.tsと同じuseSyncExternalStoreパターン)。日付が変われば
// 自動的に再度対象になる。
const DISMISSED_KEY = "asa-note:reminderDismissedDate";
const DISMISSED_CHANGED_EVENT = "asa-note:reminder-dismissed-changed";

export function getDismissedDate(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

export function dismissReminderForToday(today: string) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, today);
    window.dispatchEvent(new Event(DISMISSED_CHANGED_EVENT));
  } catch {
    // プライベートブラウジング等で書き込めない場合はあきらめる(閉じる操作自体は継続できる)
  }
}

function subscribe(callback: () => void) {
  window.addEventListener(DISMISSED_CHANGED_EVENT, callback);
  return () => window.removeEventListener(DISMISSED_CHANGED_EVENT, callback);
}

export function useDismissedDate(): string | null {
  return useSyncExternalStore(subscribe, getDismissedDate, () => null);
}
