"use client";

import { useLiveQuery } from "dexie-react-hooks";
import type { Outcome } from "@/constants/choices";
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

// カレンダー用: 指定した月("YYYY-MM")の自分の記録を、日付ごとの結果(outcome)に
// まとめて返す(入力状況のハイライト表示に使う)。同じ日に複数件あれば最新のものを使う。
export function useRecordStatusForMonth(monthKey: string, userId: string | null) {
  return useLiveQuery(async () => {
    const rows = await localDb.records.where("recordDate").startsWith(monthKey).toArray();
    const own = rows.filter((r) => !r.userId || r.userId === userId);
    own.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    const map = new Map<string, Outcome | null>();
    for (const r of own) {
      map.set(r.recordDate, r.outcome ?? null);
    }
    return map;
  }, [monthKey, userId]);
}

// 未同期件数(AuthStatusの表示用)。
export function usePendingSyncCount() {
  return useLiveQuery(
    () => localDb.records.where("syncStatus").equals("pending").count(),
    []
  );
}
