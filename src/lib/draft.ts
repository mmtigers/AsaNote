"use client";

import { useSyncExternalStore } from "react";

// 記録フロー(src/app/page.tsx)がlocalStorageに保存する「入力途中の下書き」の
// キーと存在確認を、BottomNavなど他のコンポーネントからも参照できるように
// 共有しておくモジュール。実際の下書きの読み書きはpage.tsx側が行う。
export const DRAFT_STORAGE_KEY = "asa-note:draft";

const DRAFT_CHANGED_EVENT = "asa-note:draft-changed";

// 下書きをlocalStorageへ書いた/消した直後にpage.tsx側から呼び、同一タブ内の
// 購読者(BottomNavのバッジなど)へ即座に反映させる。
// (storageイベントは別タブにしか飛ばないため、自タブ用に別途通知する)
export function notifyDraftChanged() {
  window.dispatchEvent(new Event(DRAFT_CHANGED_EVENT));
}

function hasDraftNow(): boolean {
  try {
    return window.localStorage.getItem(DRAFT_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

function subscribe(callback: () => void) {
  window.addEventListener(DRAFT_CHANGED_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(DRAFT_CHANGED_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

// 入力途中(保存前)の記録が残っているかどうか。BottomNavの「記録する」タブに
// 再開を促すバッジを出すために使う。
export function useHasDraft(): boolean {
  return useSyncExternalStore(subscribe, hasDraftNow, () => false);
}
