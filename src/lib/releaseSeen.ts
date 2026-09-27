"use client";

import { createLocalStorageStore } from "@/lib/localStorageStore";

// 最後に確認したアプデのバージョンを覚えておき、それより新しいリリースがあれば
// トップ画面のアプデ通知バナーに「新着」として出す(reminderDismissal.ts と同じ定型)。
const store = createLocalStorageStore("asa-note:lastSeenReleaseVersion", "asa-note:release-seen-changed");

export function markVersionSeen(version: string) {
  store.set(version);
}

export function useLastSeenVersion(): string | null {
  return store.use();
}
