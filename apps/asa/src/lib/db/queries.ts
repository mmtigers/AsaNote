"use client";

import { useLiveQuery } from "dexie-react-hooks";
import type { Outcome } from "@/constants/choices";
import { localDb } from "./localDb";
import { isOwnRecord } from "@note/core/ownership";

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

// 理由の選択肢を使用頻度順に並べるための履歴: 自分の記録(指定した子どもの分だけ)。
// 子どもを登録していない家庭ではchildIdはnullで、childId未設定(旧来)の記録のみが対象
// (詳しくはfindLatestOwnRecordForDateを参照)。
export function useOwnRecordsForReasons(userId: string | null, childId: string | null) {
  return useLiveQuery(async () => {
    const all = await localDb.records.toArray();
    return all.filter((r) => isOwnRecord(r, userId) && (r.childId ?? null) === childId);
  }, [userId, childId]);
}

// カレンダー用: 指定した月("YYYY-MM")の記録を、日付ごとの結果(outcome)にまとめて
// 返す(入力状況のハイライト表示に使う)。傾向タブのカレンダー(outcomeByDate)と
// 揃えて、パートナーの記録も含める(#1-2: 記録ページのカレンダーにパートナーの
// 記録が反映されないバグの修正)。同じ日に複数件あれば最新のものを使う。
// childIdは複数の子ども対応(#3)向け(詳しくはfindLatestOwnRecordForDateを参照)。
export function useRecordStatusForMonth(monthKey: string, childId: string | null = null) {
  return useLiveQuery(async () => {
    const rows = await localDb.records.where("recordDate").startsWith(monthKey).toArray();
    const relevant = rows.filter((r) => (r.childId ?? null) === childId);
    relevant.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    const map = new Map<string, Outcome | null>();
    for (const r of relevant) {
      map.set(r.recordDate, r.outcome ?? null);
    }
    return map;
  }, [monthKey, childId]);
}

// 未同期件数(AuthStatusの表示用)。
export function usePendingSyncCount() {
  return useLiveQuery(
    () => localDb.records.where("syncStatus").equals("pending").count(),
    []
  );
}

// 入力リマインダー(#6)用: 指定した日付の自分の記録が既に(outcomeまで)入力済みか。
// 子どもごとの内訳は見ず、その日に何か1件でも記録していればリマインドしない。
export function useHasTodayOwnRecord(recordDate: string, userId: string | null) {
  return useLiveQuery(async () => {
    const rows = await localDb.records.where("recordDate").equals(recordDate).toArray();
    return rows.some((r) => isOwnRecord(r, userId) && !!r.outcome);
  }, [recordDate, userId]);
}

// パートナーの記録完了状態の可視化(#3-5)用: 指定した日付・子どものパートナー
// (自分以外)の記録が既に(outcomeまで)入力済みか。isOwnRecordの否定で判定するため、
// クラウド未同期(userId未設定)の行は「自分の記録」として除外される。
export function useHasTodayPartnerRecord(
  recordDate: string,
  userId: string | null,
  childId: string | null = null
) {
  return useLiveQuery(async () => {
    const rows = await localDb.records.where("recordDate").equals(recordDate).toArray();
    return rows.some((r) => !isOwnRecord(r, userId) && (r.childId ?? null) === childId && !!r.outcome);
  }, [recordDate, userId, childId]);
}
