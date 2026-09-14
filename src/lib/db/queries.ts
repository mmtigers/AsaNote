"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { localDb } from "./localDb";

// タイムライン用: 日付の新しい順に並べた全記録(自分+グループメンバー)。
export function useRecordsTimeline() {
  return useLiveQuery(async () => {
    const all = await localDb.records.toArray();
    return all.sort((a, b) => {
      if (a.recordDate !== b.recordDate) return b.recordDate.localeCompare(a.recordDate);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, []);
}

// 未同期件数(AuthStatusの表示用)。
export function usePendingSyncCount() {
  return useLiveQuery(
    () => localDb.records.where("syncStatus").equals("pending").count(),
    []
  );
}
