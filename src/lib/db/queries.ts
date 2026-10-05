"use client";

import { useLiveQuery } from "dexie-react-hooks";
import type { Outcome } from "@/constants/choices";
import { localDb } from "./localDb";
import { isOwnRecord } from "./ownership";

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

// 選択肢(タグ・時刻の候補)を使用頻度順に並べるための履歴: 自分の記録(指定した子どもの分だけ)。
// 子どもを登録していない家庭では childId は null で、childId 未設定の記録のみが対象。
export function useOwnRecordsForHistory(userId: string | null, childId: string | null) {
  return useLiveQuery(async () => {
    const all = await localDb.records.toArray();
    return all.filter((r) => isOwnRecord(r, userId) && (r.childId ?? null) === childId);
  }, [userId, childId]);
}

// カレンダー用: 指定した月("YYYY-MM")の記録を、日付ごとの結果(outcome)にまとめて返す。
// パートナーの記録も含める。同じ日に複数件あれば最新のものを使う。
export function useRecordStatusForMonth(monthKey: string, childId: string | null = null) {
  return useLiveQuery(async () => {
    const rows = await localDb.records.where("recordDate").startsWith(monthKey).toArray();
    const relevant = rows.filter((r) => (r.childId ?? null) === childId);
    relevant.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    const map = new Map<string, Outcome | null>();
    for (const r of relevant) map.set(r.recordDate, r.outcome);
    return map;
  }, [monthKey, childId]);
}

// 選択日の自分の記録(要約カードの表示用)。
export function useOwnRecordForDate(recordDate: string, userId: string | null, childId: string | null) {
  return useLiveQuery(async () => {
    const rows = await localDb.records.where("recordDate").equals(recordDate).toArray();
    const own = rows.filter((r) => isOwnRecord(r, userId) && (r.childId ?? null) === childId);
    own.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return own[0] ?? null;
  }, [recordDate, userId, childId]);
}

// 記録ごとの写真枚数(エクスポートのCSV用)。
export function usePhotoCounts() {
  return useLiveQuery(async () => {
    const map = new Map<string, number>();
    for (const p of await localDb.photos.toArray()) map.set(p.recordId, (map.get(p.recordId) ?? 0) + 1);
    return map;
  }, []);
}

// 未同期件数(AuthStatus の表示用)。
export function usePendingSyncCount() {
  return useLiveQuery(
    async () =>
      (await localDb.records.where("syncStatus").equals("pending").count()) +
      (await localDb.photos.where("syncStatus").equals("pending").count()),
    []
  );
}
