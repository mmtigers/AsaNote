"use client";

import { createSelectedChildStore } from "@note/core/selectedChild";
import { APP_ID } from "@/lib/appConfig";

// 実装は @note/core/selectedChild。このアプリ用のインスタンスを作って公開する。
export const { getSelectedChildId, setSelectedChildId, useSelectedChildId } = createSelectedChildStore(APP_ID);
