"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
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

// ホーム・タイムライン・傾向で使う、子ども一覧の軽量フック。未ログインの間はnull、
// 取得できれば(0件含め)配列を返す。
export function useChildren(): Child[] | null {
  const { session, loading } = useAuth();
  const [children, setChildren] = useState<Child[] | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 未ログイン確定後に一度だけnullを確定させる後始末で、フェッチ自体は発生しない
      setChildren(null);
      return;
    }
    let active = true;
    getChildren()
      .then((data) => {
        if (active) setChildren(data);
      })
      .catch(() => {
        if (active) setChildren([]);
      });
    return () => {
      active = false;
    };
  }, [loading, session]);

  return children;
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
