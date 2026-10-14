"use client";

import { createSyncStatus } from "@note/core/syncStatus";
import { APP_ID } from "@/lib/appConfig";

// 実装は @note/core/syncStatus。このアプリ用のインスタンスを作って公開する。
export const { getSyncFailing, reportSyncOutcome, getLastSuccessAt, dismissSyncFailureNotice, useSyncFailing } = createSyncStatus(APP_ID);
