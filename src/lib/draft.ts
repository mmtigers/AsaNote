"use client";

import { createLocalStorageStore } from "@/lib/localStorageStore";

// 記録フォームが localStorage に保存する「入力途中の下書き」のキーと存在確認を、
// BottomNav など他のコンポーネントからも参照できるように共有しておくモジュール。
// 実際の読み書き(loadDraft / saveDraft / clearDraft)は src/app/_home/draftStorage.ts が行う。
//
// 下書きは別タブで保存/破棄されることもあるので crossTab で `storage` も購読する。
export const DRAFT_STORAGE_KEY = "yoru-note:draft";

const store = createLocalStorageStore(DRAFT_STORAGE_KEY, "yoru-note:draft-changed", { crossTab: true });

// 下書きを書いた/消した直後に draftStorage.ts 側から呼び、同一タブ内の購読者
// (BottomNav のバッジなど)へ即座に反映させる。storage イベントは別タブにしか飛ばない。
export function notifyDraftChanged() {
  store.notify();
}

// 入力途中(保存前)の記録が残っているかどうか。BottomNav の「記録する」タブに
// 再開を促すバッジを出すために使う。
export function useHasDraft(): boolean {
  return store.use() !== null;
}
