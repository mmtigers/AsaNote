"use client";

import { createReleaseSeenStore } from "@note/core/releaseSeen";
import { APP_ID } from "@/lib/appConfig";

// 実装は @note/core/releaseSeen。このアプリ用のインスタンスを作って公開する。
export const { markVersionSeen, useLastSeenVersion } = createReleaseSeenStore(APP_ID);
