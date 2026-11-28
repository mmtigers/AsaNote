import { getSupabaseClient } from "../supabase/client";

// 退会(アカウントとデータの削除。#290)。削除はサーバーの Edge Function(supabase/functions/delete-account)が、
// ログイン中の本人のアカウントだけを対象に行う。確認の文言はサーバーでも確かめる。
export const DELETE_CONFIRM_PHRASE = "退会する";

export async function deleteMyAccount(confirm: string): Promise<void> {
  const { data, error } = await getSupabaseClient().functions.invoke("delete-account", { body: { confirm } });
  if (error) {
    // 関数が返した利用者向けの文(message)があれば、それを出す。
    const context = (error as { context?: Response }).context;
    const body = context && typeof context.json === "function" ? await context.json().catch(() => null) : null;
    throw new Error((body as { message?: string } | null)?.message ?? "退会の処理に失敗しました。通信状況を確かめて、もう一度お試しください");
  }
  if (data && (data as { ok?: boolean }).ok === false) {
    throw new Error((data as { message?: string }).message ?? "退会の処理に失敗しました");
  }
}
