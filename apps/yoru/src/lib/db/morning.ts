"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import { PULL_PAGE_SIZE } from "./sync";

// あさノートの records(朝の記録)を読む。共有モード(同じSupabaseプロジェクト)でだけ存在し、
// よるノートからは読み取り専用・外部キーなし(docs/SPEC.md §7)。RLSはあさノート側の定義どおり
// 「本人+同じグループのメンバー」。結合は record_date と child_id による論理結合のみ。
export type MorningOutcome = "smooth" | "reluctant" | "absent";

export interface MorningRecord {
  recordDate: string; // "YYYY-MM-DD"
  childId: string | null;
  outcome: MorningOutcome | null;
  wakeTime: string | null; // "HH:MM"
  updatedAt: string;
}

interface MorningRow {
  record_date: string;
  child_id: string | null;
  outcome: string | null;
  wake_time: string | null;
  updated_at: string;
}

const OUTCOMES: readonly string[] = ["smooth", "reluctant", "absent"];

export function fromMorningRow(row: MorningRow): MorningRecord {
  return {
    recordDate: row.record_date,
    childId: row.child_id,
    outcome: row.outcome && OUTCOMES.includes(row.outcome) ? (row.outcome as MorningOutcome) : null,
    // Postgres の time は "HH:MM:SS" で返るので "HH:MM" に揃える。
    wakeTime: row.wake_time ? row.wake_time.slice(0, 5) : null,
    updatedAt: row.updated_at,
  };
}

// 取得できない場合(分離モードで表が無い・権限・通信失敗)は null。連携の表示を出さないだけにする。
export async function fetchMorningRecords(): Promise<MorningRecord[] | null> {
  const supabase = getSupabaseClient();
  const all: MorningRecord[] = [];
  for (let from = 0; ; from += PULL_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("records")
      .select("record_date, child_id, outcome, wake_time, updated_at")
      .order("record_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PULL_PAGE_SIZE - 1);
    if (error) return null;
    const page = (data ?? []) as MorningRow[];
    all.push(...page.map(fromMorningRow));
    if (page.length < PULL_PAGE_SIZE) break;
  }
  return all;
}

// 未ログイン・取得中・取得不可はすべて null(連携セクションを出さない)。
export function useMorningRecords(): MorningRecord[] | null {
  const { session, loading } = useAuth();
  const [records, setRecords] = useState<MorningRecord[] | null>(null);

  useEffect(() => {
    if (loading || !session) return;
    let active = true;
    fetchMorningRecords()
      .then((r) => active && setRecords(r))
      .catch(() => active && setRecords(null));
    return () => {
      active = false;
    };
  }, [loading, session]);

  return session ? records : null;
}
