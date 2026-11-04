"use client";

import { useLiveQuery } from "dexie-react-hooks";
import type { Outcome } from "@/constants/choices";
import { localDb } from "./localDb";
import { isOwnRecord } from "@note/core/ownership";
import { isForChildOrUnassigned, pickDayStatuses, pickLatestForChild } from "./childMatch";

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
    return all.filter((r) => isOwnRecord(r, userId) && isForChildOrUnassigned(r.childId, childId));
  }, [userId, childId]);
}

// カレンダー用: 指定した月("YYYY-MM")の記録を、日付ごとの結果(outcome)にまとめて返す。
// パートナーの記録も含める。同じ日に複数件あれば最新のものを使う。
// 子どもを複数にする前の記録(未分類)も、選択中の子どもの分として出す(同じ日は子どもの記録を優先)。
export function useRecordStatusForMonth(monthKey: string, childId: string | null = null) {
  return useLiveQuery(async () => {
    const rows = await localDb.records.where("recordDate").startsWith(monthKey).toArray();
    const map: Map<string, Outcome | null> = pickDayStatuses(rows, childId);
    return map;
  }, [monthKey, childId]);
}

// 選択日の自分の記録(要約カードの表示用)。
export function useOwnRecordForDate(recordDate: string, userId: string | null, childId: string | null) {
  return useLiveQuery(async () => {
    const rows = await localDb.records.where("recordDate").equals(recordDate).toArray();
    return pickLatestForChild(rows.filter((r) => isOwnRecord(r, userId)), childId) ?? null;
  }, [recordDate, userId, childId]);
}

// 指定した日付・子どもの記録が、自分かパートナーのいずれかで(outcomeまで)入力済みか。
// アプリ内リマインドの表示判定に使う。Push(reminderHandler)も「グループの誰かが記録済みなら送らない」
// ので、ここも自分の記録だけに限らない(パートナーが記録済みなのに「まだ」と出る不具合の修正)。
export function useHasTodayRecord(recordDate: string, childId: string | null = null) {
  return useLiveQuery(async () => {
    const rows = await localDb.records.where("recordDate").equals(recordDate).toArray();
    return rows.some((r) => isForChildOrUnassigned(r.childId, childId) && !!r.outcome);
  }, [recordDate, childId]);
}

// 指定した日付・子どものパートナー(自分以外)の記録が(outcomeまで)入力済みか。
// クラウド未同期(userId未設定)の行は「自分の記録」として除外される。
export function useHasTodayPartnerRecord(recordDate: string, userId: string | null, childId: string | null = null) {
  return useLiveQuery(async () => {
    const rows = await localDb.records.where("recordDate").equals(recordDate).toArray();
    return rows.some((r) => !isOwnRecord(r, userId) && isForChildOrUnassigned(r.childId, childId) && !!r.outcome);
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
