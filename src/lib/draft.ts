"use client";

import { createLocalStorageStore } from "@/lib/localStorageStore";

// 記録フローがlocalStorageに保存する「入力途中の下書き」のキーと存在確認を、
// BottomNavなど他のコンポーネントからも参照できるように共有しておくモジュール。
// 実際の読み書き(loadDraft / saveDraft / clearDraft)は src/app/_home/draftStorage.ts が
// 行い、そちらがこのモジュールの DRAFT_STORAGE_KEY と notifyDraftChanged を使う。
//
// 読み書き・通知・購読の定型は src/lib/localStorageStore.ts に共通化してある(#62)。
// 下書きは別タブで保存/破棄されることもあるので crossTab で `storage` も購読する。
export const DRAFT_STORAGE_KEY = "asa-note:draft";

const store = createLocalStorageStore(DRAFT_STORAGE_KEY, "asa-note:draft-changed", {
  crossTab: true,
});

// 下書きをlocalStorageへ書いた/消した直後にdraftStorage.ts側から呼び、同一タブ内の
// 購読者(BottomNavのバッジなど)へ即座に反映させる。
// (storageイベントは別タブにしか飛ばないため、自タブ用に別途通知する)
export function notifyDraftChanged() {
  store.notify();
}

// 入力途中(保存前)の記録が残っているかどうか。BottomNavの「記録する」タブに
// 再開を促すバッジを出すために使う。
export function useHasDraft(): boolean {
  return store.use() !== null;
}
