"use client";

import { SyncFailureNotice as SyncFailureNoticeView } from "@note/core/components/SyncFailureNotice";
import { dismissSyncFailureNotice, useSyncFailing } from "@/lib/db/syncStatus";

// 表示は @note/core。このアプリの同期状態(syncStatus)を渡す。
export function SyncFailureNotice() {
  const failing = useSyncFailing();
  return <SyncFailureNoticeView failing={failing} onDismiss={dismissSyncFailureNotice} />;
}
