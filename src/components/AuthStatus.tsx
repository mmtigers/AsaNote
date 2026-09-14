"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import { clearLocalData } from "@/lib/db/localDb";
import { usePendingSyncCount } from "@/lib/db/queries";
import { getSupabaseClient } from "@/lib/supabase/client";

export function AuthStatus() {
  const { session, loading } = useAuth();
  const pendingCount = usePendingSyncCount();

  async function handleLogout() {
    try {
      await getSupabaseClient().auth.signOut();
    } catch (error) {
      console.error(error);
    } finally {
      // 共有端末で前ユーザーのローカルデータが残り、次にログインした別ユーザーの
      // アカウントへ誤同期されるのを防ぐため、ログアウト時にローカルDexie DBを
      // 全テーブルクリアする。
      try {
        await clearLocalData();
      } catch (error) {
        console.error(error);
      }
    }
  }

  if (loading) return null;

  if (!session) {
    return (
      <Link
        href="/login"
        className="text-xs text-[var(--accent)] underline underline-offset-2 focus:ring-2 focus:ring-[var(--accent)]"
      >
        ログインして家族と同期する
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-xs text-[var(--sub)]">
      <span className="whitespace-nowrap">{session.user.email}</span>
      {!!pendingCount && <span className="whitespace-nowrap text-[var(--accent)]">未同期{pendingCount}件</span>}
      <button
        type="button"
        onClick={handleLogout}
        className="whitespace-nowrap underline underline-offset-2 focus:ring-2 focus:ring-[var(--accent)]"
      >
        ログアウト
      </button>
    </div>
  );
}
