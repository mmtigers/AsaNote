"use client";

import { createLocalStorageStore } from "./localStorageStore";

// 最後に確認したアプデのバージョンを覚えておき、それより新しいリリースがあれば
// トップ画面のアプデ通知バナーに「新着」として出す(reminderDismissal.ts と同じ定型)。
//
// localStorage のキーは `${appId}:lastSeenReleaseVersion`、通知イベントは
// `${appId}:release-seen-changed`(appId は "asa-note" / "yoru-note")。
// ユーザー端末に保存済みの値を失わないよう、既存のキーを変えないこと。
export interface ReleaseSeenStore {
  markVersionSeen(version: string): void;
  useLastSeenVersion(): string | null;
}

export function createReleaseSeenStore(appId: string): ReleaseSeenStore {
  const store = createLocalStorageStore(`${appId}:lastSeenReleaseVersion`, `${appId}:release-seen-changed`);

  return {
    markVersionSeen(version: string) {
      store.set(version);
    },
    useLastSeenVersion(): string | null {
      return store.use();
    },
  };
}
