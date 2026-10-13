"use client";

import { getSupabaseClient } from "../supabase/client";
import { reportHandledError } from "../clientErrors";
import { useAuthedList } from "./useAuthedList";
import type { Child } from "../types/group";

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

// 子ども一覧の最後に取得できた結果を端末に覚えておく(#126)。子どもが複数いる家庭で、
// オフライン起動などで一覧を取得できないと、一覧が空になり、記録が子ども未分類
// (childId: null)で保存されてしまうため。取得に失敗したときだけ、これを使う。
// 子どもはあさノート・よるノートで共通の表なので、キーはアプリ名を含めない。
// 別のユーザーの一覧を使わないよう、ユーザーIDごとに分け、ログアウトで消す。
const CHILDREN_CACHE_PREFIX = "note:childrenCache:";

function readChildrenCache(userId: string): Child[] | null {
  try {
    const raw = window.localStorage.getItem(CHILDREN_CACHE_PREFIX + userId);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Child[]) : null;
  } catch (error) {
    reportHandledError("storage/children-cache-read", error);
    return null;
  }
}

function writeChildrenCache(userId: string, children: Child[]): void {
  try {
    window.localStorage.setItem(CHILDREN_CACHE_PREFIX + userId, JSON.stringify(children));
  } catch (error) {
    // 書けない環境ではあきらめる(キャッシュが無いだけで、通常の動作は変わらない)
    reportHandledError("storage/children-cache-write", error);
  }
}

/** 端末に覚えている子ども一覧を消す。ログアウト時に呼ぶ(共有端末で次の人に見せないため)。 */
export function clearChildrenCache(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(CHILDREN_CACHE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // 消せない環境では何もしない
  }
}

// 一覧フック用: 取得できれば結果を覚え、失敗したときは覚えている一覧を返す(無ければ例外のまま)。
async function getChildrenWithCache(): Promise<Child[]> {
  const supabase = getSupabaseClient();
  // getSession はローカルに保存された認証情報を読むだけで、オフラインでも失敗しない。
  const userId = (await supabase.auth.getSession()).data.session?.user.id;
  try {
    const children = await getChildren();
    if (userId) writeChildrenCache(userId, children);
    return children;
  } catch (error) {
    const cached = userId ? readChildrenCache(userId) : null;
    if (cached) return cached;
    throw error;
  }
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
  return useAuthedList(getChildrenWithCache, { whenSignedOut: "null", where: "list/children" });
}

// 選択中の子どもIDを、実際に存在する子ども一覧に照らして解決する。子どもが0〜1人の
// 家庭では機能自体を無効化する(常にnullを返す=記録フォームからは選択UIを出さない)。
export function resolveEffectiveChildId(children: Child[] | null, selectedId: string | null): string | null {
  if (!children || children.length <= 1) return null;
  return children.some((c) => c.id === selectedId) ? selectedId : (children[0]?.id ?? null);
}
