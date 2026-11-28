"use client";

import { getChildren } from "@note/core/db/children";
import { getSupabaseClient } from "@note/core/supabase/client";
import type { Child } from "@note/core/types/group";

// 子どもの名前・誕生日(共通の children 表)と、館の名前(sakuhin_child_settings)をまとめて扱う(SPEC §4)。
// 子どもの一覧はオンライン時にサーバーへ直接読み書きする(あさノート・よるノートの children.ts と同じ方式)。

export const MAX_NAME_LENGTH = 50;
export const MAX_MUSEUM_NAME_LENGTH = 30;

export interface ChildProfile extends Child {
  /** 館の名前。設定していなければ null(画面では既定の名前を出す)。 */
  museum_name: string | null;
}

/** 館の名前の既定(「はなちゃん美術館」)。 */
export function defaultMuseumName(childName: string): string {
  return `${childName}ちゃん美術館`;
}

export function museumNameOf(profile: Pick<ChildProfile, "name" | "museum_name">): string {
  return profile.museum_name?.trim() || defaultMuseumName(profile.name);
}

export async function getChildProfiles(): Promise<ChildProfile[]> {
  const children = await getChildren();
  if (children.length === 0) return [];
  const { data, error } = await getSupabaseClient()
    .from("sakuhin_child_settings")
    .select("child_id, museum_name")
    .in(
      "child_id",
      children.map((c) => c.id),
    );
  if (error) throw error;
  const names = new Map((data ?? []).map((row: { child_id: string; museum_name: string | null }) => [row.child_id, row.museum_name]));
  return children.map((child) => ({ ...child, museum_name: names.get(child.id) ?? null }));
}

export interface ChildProfileInput {
  name: string;
  /** "YYYY-MM-DD"。空なら未設定(null)。 */
  birthDate: string;
  /** 空なら既定の名前を使う(null で保存)。 */
  museumName: string;
}

/** 入力の検査。問題があれば日本語のメッセージを返す。today は日本時間の今日("YYYY-MM-DD")。 */
export function validateChildProfile(input: ChildProfileInput, today: string): string | null {
  const name = input.name.trim();
  if (!name) return "名前を入力してください";
  if (name.length > MAX_NAME_LENGTH) return `名前は${MAX_NAME_LENGTH}文字以内で入力してください`;
  if (input.birthDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) return "誕生日の形が正しくありません";
    if (input.birthDate > today) return "誕生日に未来の日付は入れられません";
  }
  if (input.museumName.trim().length > MAX_MUSEUM_NAME_LENGTH) {
    return `館の名前は${MAX_MUSEUM_NAME_LENGTH}文字以内で入力してください`;
  }
  return null;
}

/**
 * 名前・誕生日・館の名前を保存する。家族の誰でも直せる(children の更新の RLS。SPEC §11 D10)。
 * 館の名前は、子どもごとに1行(child_id が主キー)なので upsert する。
 */
export async function saveChildProfile(childId: string, input: ChildProfileInput, today: string): Promise<void> {
  const problem = validateChildProfile(input, today);
  if (problem) throw new Error(problem);
  const supabase = getSupabaseClient();

  const { error: childError } = await supabase
    .from("children")
    .update({ name: input.name.trim(), birth_date: input.birthDate || null })
    .eq("id", childId);
  if (childError) throw childError;

  const museumName = input.museumName.trim() || null;
  const { error: settingsError } = await supabase
    .from("sakuhin_child_settings")
    .upsert({ child_id: childId, museum_name: museumName }, { onConflict: "child_id" });
  if (settingsError) throw settingsError;
}
