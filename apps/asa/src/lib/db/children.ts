"use client";

import { getSupabaseClient } from "@note/core/supabase/client";
import { useAuthedList } from "./useAuthedList";
import type { Child } from "@/types/models";
import { useSelectedChildId } from "./selectedChild";

const MAX_NAME_LENGTH = 50;

// 子どもリストは家族(グループ)単位の設定情報であり、記録本体のようにオフラインで
// 作成する必要は薄いため、groups.tsと同じ「オンライン時にSupabaseへ直接読み書きする」
// 方式にする(Dexieへのミラーリングはしない)。
export async function getChildren(): Promise<Child[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("children").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Child[];
}

export async function createChild(name: string): Promise<Child> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("名前を入力してください");
  if (trimmed.length > MAX_NAME_LENGTH) throw new Error(`名前は${MAX_NAME_LENGTH}文字以内で入力してください`);

  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("ログインが必要です");

  const { data, error } = await supabase
    .from("children")
    .insert({ name: trimmed, created_by: userId })
    .select()
    .single();
  if (error) throw error;
  return data as Child;
}

export async function updateChild(id: string, name: string): Promise<Child> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("名前を入力してください");
  if (trimmed.length > MAX_NAME_LENGTH) throw new Error(`名前は${MAX_NAME_LENGTH}文字以内で入力してください`);

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("children")
    .update({ name: trimmed })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Child;
}

/**
 * 子どもを削除する(#59)。SPEC 4.5 の「子どもを削除しても記録は残る」は、
 * records.child_id が `on delete set null`(supabase/schema.sql)であることで担保される
 * ため、ここでは records に触らない。RLS 上、削除できるのは作成者のみ。
 */
export async function deleteChild(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("children").delete().eq("id", id);
  if (error) throw error;
}

// ホーム・タイムライン・傾向で使う、子ども一覧の軽量フック。未ログインの間はnull、
// 取得できれば(0件含め)配列を返す。
//
// 未ログイン時に [] ではなく null を返すのは意図的。子ども一覧が未確定の間に
// 「子ども0人」と解釈されると記録の絞り込みが誤るため、「まだ分からない」と同じ扱いにする
// (src/app/page.tsx の editChildIdOverride はこの性質への同期的な回避策)。
export function useChildren(): Child[] | null {
  return useAuthedList(getChildren, { whenSignedOut: "null" });
}

// 選択中の子どもIDを、実際に存在する子ども一覧に照らして解決する。子どもが0〜1人の
// 家庭では機能自体を無効化する(常にnullを返す=記録フォームからは選択UIを出さない)。
export function resolveEffectiveChildId(children: Child[] | null, selectedId: string | null): string | null {
  if (!children || children.length <= 1) return null;
  return children.some((c) => c.id === selectedId) ? selectedId : (children[0]?.id ?? null);
}

// 記録フォーム(ホーム画面)で「今どの子どもを記録対象にしているか」を返す。
export function useEffectiveChildId(): string | null {
  const children = useChildren();
  const selectedId = useSelectedChildId();
  return resolveEffectiveChildId(children, selectedId);
}
