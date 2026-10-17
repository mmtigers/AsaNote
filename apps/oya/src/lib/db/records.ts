import {
  CONDITION_CHOICES,
  MEAL_CHOICES,
  MEDICATION_CHOICES,
  type Condition,
  type Meal,
  type Medication,
} from "@/constants/choices";
import { db } from "@/lib/supabase";

// 日々の記録の読み書き。権限の検証はサーバー(RLS・トリガー・関数)が行う(supabase/schema.sql)。
//   - 1人1日1件: (user_id, record_date) の unique と upsert で、同じ日の記録は上書きになる(重複しない)。
//   - family_id・完了時刻・持ち主はサーバーが決める(クライアントの値は使われない)。

/** 画面で入力する内容。null は未入力(「食べていない」「しなかった」とは別)。 */
export interface DailyRecordInput {
  breakfast: Meal | null;
  lunch: Meal | null;
  dinner: Meal | null;
  medication: Medication | null;
  wentOut: boolean | null;
  shopping: boolean | null;
  hospital: boolean | null;
  condition: Condition | null;
  memo: string;
}

export interface DailyRecord extends DailyRecordInput {
  id: string;
  userId: string;
  recordDate: string;
  completedAt: string | null;
  updatedAt: string;
}

export const EMPTY_INPUT: DailyRecordInput = {
  breakfast: null,
  lunch: null,
  dinner: null,
  medication: null,
  wentOut: null,
  shopping: null,
  hospital: null,
  condition: null,
  memo: "",
};

type RecordRow = {
  id: string;
  user_id: string;
  record_date: string;
  breakfast: string | null;
  lunch: string | null;
  dinner: string | null;
  medication: string | null;
  went_out: boolean | null;
  shopping: boolean | null;
  hospital: boolean | null;
  condition: string | null;
  memo: string | null;
  completed_at: string | null;
  updated_at: string;
};

const RECORD_COLUMNS =
  "id, user_id, record_date, breakfast, lunch, dinner, medication, went_out, shopping, hospital, condition, memo, completed_at, updated_at";

// DB の check 制約で値は限られるが、型の上でも絞る(想定外の値は未入力として扱う)。
function pick<T extends string>(choices: readonly { value: T }[], value: string | null): T | null {
  return choices.find((c) => c.value === value)?.value ?? null;
}

export function fromRow(row: RecordRow): DailyRecord {
  return {
    id: row.id,
    userId: row.user_id,
    recordDate: row.record_date,
    breakfast: pick(MEAL_CHOICES, row.breakfast),
    lunch: pick(MEAL_CHOICES, row.lunch),
    dinner: pick(MEAL_CHOICES, row.dinner),
    medication: pick(MEDICATION_CHOICES, row.medication),
    wentOut: row.went_out,
    shopping: row.shopping,
    hospital: row.hospital,
    condition: pick(CONDITION_CHOICES, row.condition),
    memo: row.memo ?? "",
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

/** 入力から、記録の行(保存する列)を作る。メモは前後の空白を除き、空なら未入力(null)にする。 */
export function toRowValues(input: DailyRecordInput) {
  const memo = input.memo.trim();
  return {
    breakfast: input.breakfast,
    lunch: input.lunch,
    dinner: input.dinner,
    medication: input.medication,
    went_out: input.wentOut,
    shopping: input.shopping,
    hospital: input.hospital,
    condition: input.condition,
    memo: memo === "" ? null : memo,
  };
}

/** 自分のその日の記録(無ければ null)。 */
export async function fetchOwnRecord(userId: string, recordDate: string): Promise<DailyRecord | null> {
  const { data, error } = await db()
    .from("oya_records")
    .select(RECORD_COLUMNS)
    .eq("user_id", userId)
    .eq("record_date", recordDate)
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

/**
 * 自分のその日の記録を保存する(無ければ作り、あれば上書きする)。サーバーが保存した行を返す。
 * `onConflict: user_id,record_date` の upsert なので、何度保存しても(通信の再試行でも)1日1件のまま。
 * family_id は型の上で必須なので渡すが、サーバーは本人の家族で上書きする。
 */
export async function upsertOwnRecord(params: {
  userId: string;
  familyId: string;
  recordDate: string;
  input: DailyRecordInput;
}): Promise<DailyRecord> {
  const { data, error } = await db()
    .from("oya_records")
    .upsert(
      {
        user_id: params.userId,
        family_id: params.familyId,
        record_date: params.recordDate,
        ...toRowValues(params.input),
      },
      { onConflict: "user_id,record_date" }
    )
    .select(RECORD_COLUMNS)
    .single();
  if (error) throw error;
  return fromRow(data);
}

export interface RevealedPhoto {
  photoId: string;
  storagePath: string;
}

/**
 * 保存済みの記録を完了にし、その日の孫の写真を返す(写真が無ければ null)。何度呼んでも同じ結果。
 * 写真の選択(1日1回、直前の写真を避ける)はサーバーの complete_oya_record() が行う。
 */
export async function completeOwnRecord(recordDate: string): Promise<{ completedAt: string; photo: RevealedPhoto | null }> {
  const { data, error } = await db().rpc("complete_oya_record", { p_record_date: recordDate });
  if (error) throw error;
  const row = data[0];
  if (!row) throw new Error("complete_oya_record returned no row");
  return {
    completedAt: row.completed_at,
    // 写真が無い日は、photo_id・storage_path が null で返る(生成された型は null を表さない)。
    photo: row.photo_id && row.storage_path ? { photoId: row.photo_id, storagePath: row.storage_path } : null,
  };
}
