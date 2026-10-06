"use client";

import { createLocalStorageStore } from "./localStorageStore";

// ホーム画面で最後に選んだ「今どの子どもを記録しているか」を端末に覚えておく。
// タイムライン・傾向側の絞り込みは各ページのローカルstateで別管理し、常に「すべて」
// から始める(この値をそのまま使うと、子ども追加直後に他の子の過去記録が急に
// 見えなくなるため)。
//
// 読み書き・通知・購読の定型は localStorageStore.ts に共通化してある(#62)。
// localStorage のキーは `${appId}:selectedChildId`、通知イベントは `${appId}:selected-child-changed`
// (appId は "asa-note" / "yoru-note")。ユーザー端末に保存済みの値を失わないよう、既存のキーを変えないこと。
export interface SelectedChildStore {
  getSelectedChildId(): string | null;
  /** 空文字は「未選択」と同じ扱いで消す(子どものidが空文字になることはない)。 */
  setSelectedChildId(id: string | null): void;
  useSelectedChildId(): string | null;
}

export function createSelectedChildStore(appId: string): SelectedChildStore {
  const store = createLocalStorageStore(`${appId}:selectedChildId`, `${appId}:selected-child-changed`);

  return {
    getSelectedChildId(): string | null {
      return store.get();
    },
    setSelectedChildId(id: string | null) {
      store.set(id || null);
    },
    useSelectedChildId(): string | null {
      return store.use();
    },
  };
}
