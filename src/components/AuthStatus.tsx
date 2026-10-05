"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getSupabaseClient } from "@/lib/supabase/client";

// ホーム画面のヘッダーに置く、ログイン状態の表示。
// 記録のローカルキャッシュ(Dexie)は未実装のため、ログアウト時に消すものはまだ無い。
// 記録機能を足すときに、あさノートと同じ「未同期の確認+ローカル全消去」をここへ入れる。
export function AuthStatus() {
  const { session, loading } = useAuth();

  async function logout() {
    try {
      await getSupabaseClient().auth.signOut();
    } catch (error) {
      console.error(error);
    }
  }

  if (loading) return null;

  if (!session) {
    return (
      <Link
        href="/login"
        className="text-xs text-[var(--accent)] underline underline-offset-2 focus:ring-2 focus:ring-[var(--accent)]"
      >
        ログインして家族と共有する
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-xs text-[var(--sub)]">
      <span className="whitespace-nowrap">{session.user.email}</span>
      <button
        type="button"
        onClick={logout}
        className="whitespace-nowrap underline underline-offset-2 focus:ring-2 focus:ring-[var(--accent)]"
      >
        ログアウト
      </button>
    </div>
  );
}
