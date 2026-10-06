"use client";

import { getSupabaseClient } from "@/lib/supabase/client";

// 試したこと・検討事項ボード(SPEC §4.4)。children と同じく、家族の設定情報として
// オンライン時にSupabaseへ直接読み書きする(Dexieへのミラーリングはしない)。
export const RULE_TITLE_MAX = 100;
export const CONCERN_TITLE_MAX = 200;

export interface Rule {
  id: string;
  user_id: string;
  child_id: string | null;
  title: string;
  started_on: string; // "YYYY-MM-DD"
  ended_on: string | null;
  created_at: string;
}

export interface Concern {
  id: string;
  user_id: string;
  title: string;
  resolved_at: string | null;
  created_at: string;
}

function validateTitle(title: string, max: number, label: string): string {
  const trimmed = title.trim();
  if (!trimmed) throw new Error(`${label}を入力してください`);
  if (trimmed.length > max) throw new Error(`${label}は${max}文字以内で入力してください`);
  return trimmed;
}

async function requireUserId(): Promise<string> {
  const { data } = await getSupabaseClient().auth.getUser();
  if (!data.user?.id) throw new Error("ログインが必要です");
  return data.user.id;
}

export async function getRules(): Promise<Rule[]> {
  const { data, error } = await getSupabaseClient()
    .from("evening_rules")
    .select("*")
    .order("started_on", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Rule[];
}

export async function createRule(input: { title: string; startedOn: string; childId: string | null }): Promise<void> {
  const title = validateTitle(input.title, RULE_TITLE_MAX, "内容");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startedOn)) throw new Error("開始日を入力してください");
  const userId = await requireUserId();
  const { error } = await getSupabaseClient()
    .from("evening_rules")
    .insert({ user_id: userId, title, started_on: input.startedOn, child_id: input.childId });
  if (error) throw error;
}

// 終了日を入れると「やめた」扱いになり、空に戻せば再開できる。
export async function setRuleEnded(id: string, endedOn: string | null): Promise<void> {
  const { error } = await getSupabaseClient().from("evening_rules").update({ ended_on: endedOn }).eq("id", id);
  if (error) throw error;
}

export async function deleteRule(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from("evening_rules").delete().eq("id", id);
  if (error) throw error;
}

export async function getConcerns(): Promise<Concern[]> {
  const { data, error } = await getSupabaseClient()
    .from("evening_concerns")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Concern[];
}

export async function createConcern(title: string): Promise<void> {
  const trimmed = validateTitle(title, CONCERN_TITLE_MAX, "内容");
  const userId = await requireUserId();
  const { error } = await getSupabaseClient().from("evening_concerns").insert({ user_id: userId, title: trimmed });
  if (error) throw error;
}

export async function setConcernResolved(id: string, resolved: boolean): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("evening_concerns")
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteConcern(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from("evening_concerns").delete().eq("id", id);
  if (error) throw error;
}
