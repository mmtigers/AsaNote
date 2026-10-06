"use client";

import { useSyncExternalStore } from "react";

// sync.tsのpush(syncPendingChanges)/pull(pullFromCloud)が完了するたびに結果を集約する。
// オフライン復帰直後の一時的な失敗まで逐一知らせるとうるさいだけなので、閾値以上
// 連続で失敗した場合だけ「同期がうまくいっていない」とユーザーへ知らせる。
const SYNC_STATUS_CHANGED_EVENT = "yoru-note:sync-status-changed";
const FAILURE_THRESHOLD = 3;

let consecutiveFailures = 0;
let dismissedAtCount = 0;

// フック外(テスト等)からも読める現在値。useSyncExternalStoreのgetSnapshotは
// これをそのまま渡す。
export function getSyncFailing(): boolean {
  return consecutiveFailures >= FAILURE_THRESHOLD && consecutiveFailures > dismissedAtCount;
}

function notify() {
  window.dispatchEvent(new Event(SYNC_STATUS_CHANGED_EVENT));
}

export function reportSyncOutcome(ok: boolean) {
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

// トーストを閉じた後は、新たな失敗が積み重なるまで再表示しない
// (成功すればdismissedAtCountごとリセットされる)。
export function dismissSyncFailureNotice() {
  if (typeof window === "undefined") return;
  const wasFailing = getSyncFailing();
  dismissedAtCount = consecutiveFailures;
  if (getSyncFailing() !== wasFailing) notify();
}

function subscribe(callback: () => void) {
  window.addEventListener(SYNC_STATUS_CHANGED_EVENT, callback);
  return () => window.removeEventListener(SYNC_STATUS_CHANGED_EVENT, callback);
}

export function useSyncFailing(): boolean {
  return useSyncExternalStore(subscribe, getSyncFailing, () => false);
}
