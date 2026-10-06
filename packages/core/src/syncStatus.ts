"use client";

import { useSyncExternalStore } from "react";

// sync.tsのpush(syncPendingChanges)/pull(pullFromCloud)が完了するたびに結果を集約する。
// オフライン復帰直後の一時的な失敗まで逐一知らせるとうるさいだけなので、閾値以上
// 連続で失敗した場合だけ「同期がうまくいっていない」とユーザーへ知らせる。
//
// 状態(連続失敗数など)はアプリごとに1つ持つ。イベント名は `${appId}:sync-status-changed`
// (appId は "asa-note" / "yoru-note")。名前を変えると購読が切れるため、既存の値を変えないこと。
const FAILURE_THRESHOLD = 3;

export interface SyncStatus {
  /** フック外(テスト等)からも読める現在値。 */
  getSyncFailing(): boolean;
  reportSyncOutcome(ok: boolean): void;
  /** トーストを閉じた後は、新たな失敗が積み重なるまで再表示しない(成功すればリセット)。 */
  dismissSyncFailureNotice(): void;
  useSyncFailing(): boolean;
}

export function createSyncStatus(appId: string): SyncStatus {
  const changedEvent = `${appId}:sync-status-changed`;

  let consecutiveFailures = 0;
  let dismissedAtCount = 0;

  // useSyncExternalStoreのgetSnapshotはこれをそのまま渡す。
  function getSyncFailing(): boolean {
    return consecutiveFailures >= FAILURE_THRESHOLD && consecutiveFailures > dismissedAtCount;
  }

  function notify() {
    window.dispatchEvent(new Event(changedEvent));
  }

  function reportSyncOutcome(ok: boolean) {
    if (typeof window === "undefined") return;
    const wasFailing = getSyncFailing();
    if (ok) {
      consecutiveFailures = 0;
      dismissedAtCount = 0;
    } else {
      consecutiveFailures += 1;
    }
    if (getSyncFailing() !== wasFailing) notify();
  }

  function dismissSyncFailureNotice() {
    if (typeof window === "undefined") return;
    const wasFailing = getSyncFailing();
    dismissedAtCount = consecutiveFailures;
    if (getSyncFailing() !== wasFailing) notify();
  }

  function subscribe(callback: () => void) {
    window.addEventListener(changedEvent, callback);
    return () => window.removeEventListener(changedEvent, callback);
  }

  function useSyncFailing(): boolean {
    return useSyncExternalStore(subscribe, getSyncFailing, () => false);
  }

  return { getSyncFailing, reportSyncOutcome, dismissSyncFailureNotice, useSyncFailing };
}
