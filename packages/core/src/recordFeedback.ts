// 記録の「読んだ」印とひとことコメント(あさノート・よるノート共通)。
// 表の定義の正はあさノートの supabase/schema.sql(record_reads / record_comments)で、よるノートは
// 同じ形の evening_record_reads / evening_record_comments を持つ。表名だけが違うので、呼び出し側が
// RecordFeedbackTables で渡す。RLS(本人+同じグループのメンバーだけ読み書き可)はDB側が担う。
import { getSupabaseClient } from "./supabase/client";

export interface RecordFeedbackTables {
  reads: string;
  comments: string;
}

export interface RecordRead {
  recordId: string;
  userId: string;
  readAt: string;
}

export interface RecordComment {
  recordId: string;
  userId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

// DB側の check(char_length(btrim(body)) between 1 and 100)と揃える。
export const COMMENT_MAX_LENGTH = 100;

// 前後の空白を除いた本文。空(または長すぎる)なら null。
export function normalizeCommentBody(raw: string): string | null {
  const body = raw.trim();
  if (body.length === 0 || body.length > COMMENT_MAX_LENGTH) return null;
  return body;
}

// 1回の取得で返る上限(Supabaseの既定)に合わせたページサイズ。
const PAGE_SIZE = 1000;

// RLSで「見える記録」の分だけに絞られるので、フィルタは付けずに全件を取る(記録IDを大量に
// in() で渡すとURLが長くなりすぎる)。上限を超える分は、ページを進めて取り切る。
async function fetchAllRows(table: string, columns: string, orderBy: string): Promise<Record<string, string>[]> {
  const supabase = getSupabaseClient();
  const rows: Record<string, string>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as Record<string, string>[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export async function fetchRecordFeedback(
  tables: RecordFeedbackTables
): Promise<{ reads: RecordRead[]; comments: RecordComment[] }> {
  const [readRows, commentRows] = await Promise.all([
    fetchAllRows(tables.reads, "record_id, user_id, read_at", "read_at"),
    fetchAllRows(tables.comments, "record_id, user_id, body, created_at, updated_at", "created_at"),
  ]);
  return {
    reads: readRows.map((r) => ({ recordId: r.record_id!, userId: r.user_id!, readAt: r.read_at! })),
    comments: commentRows.map((r) => ({
      recordId: r.record_id!,
      userId: r.user_id!,
      body: r.body!,
      createdAt: r.created_at!,
      updatedAt: r.updated_at!,
    })),
  };
}

// 「読んだ」を記録する。すでに押していても(別の端末などで)エラーにせず、最初の日時を残す。
export async function markRecordRead(tables: RecordFeedbackTables, recordId: string, userId: string): Promise<RecordRead> {
  const readAt = new Date().toISOString();
  const { error } = await getSupabaseClient()
    .from(tables.reads)
    .upsert({ record_id: recordId, user_id: userId, read_at: readAt }, { onConflict: "record_id,user_id", ignoreDuplicates: true });
  if (error) throw error;
  return { recordId, userId, readAt };
}

// コメントを書く(新規)か直す(編集)。1つの記録に1人1件なので、どちらも同じ行を指す。
// 編集のとき created_at は変えない(新規のときだけ入る)。
export async function saveRecordComment(
  tables: RecordFeedbackTables,
  existing: RecordComment | undefined,
  recordId: string,
  userId: string,
  rawBody: string
): Promise<RecordComment> {
  const body = normalizeCommentBody(rawBody);
  if (body === null) throw new Error(`コメントは1〜${COMMENT_MAX_LENGTH}文字で入力してください`);
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  if (existing) {
    const { error } = await supabase
      .from(tables.comments)
      .update({ body, updated_at: now })
      .eq("record_id", recordId)
      .eq("user_id", userId);
    if (error) throw error;
    return { ...existing, body, updatedAt: now };
  }
  const { error } = await supabase
    .from(tables.comments)
    .insert({ record_id: recordId, user_id: userId, body, created_at: now, updated_at: now });
  if (error) throw error;
  return { recordId, userId, body, createdAt: now, updatedAt: now };
}

export async function deleteRecordComment(tables: RecordFeedbackTables, recordId: string, userId: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from(tables.comments)
    .delete()
    .eq("record_id", recordId)
    .eq("user_id", userId);
  if (error) throw error;
}
