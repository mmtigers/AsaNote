"use client";

import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuth } from "@/lib/auth/AuthProvider";
import { clearLocalData } from "@/lib/db/localDb";
import { usePendingSyncCount } from "@/lib/db/queries";
import { countUnsyncedChanges } from "@/lib/db/records";
import { syncPendingChanges } from "@/lib/db/sync";
import { getSupabaseClient } from "@/lib/supabase/client";

// ホーム画面のヘッダーに置く、ログイン状態の表示。
export function AuthStatus() {
  const { session, loading } = useAuth();
  const pendingCount = usePendingSyncCount();
  // ログアウト時に消えてしまう未同期件数。null のときはダイアログ非表示。
  const [unsyncedOnLogout, setUnsyncedOnLogout] = useState<number | null>(null);

  async function signOutAndClear() {
    try {
      await getSupabaseClient().auth.signOut();
    } catch (error) {
      console.error(error);
    } finally {
      // 共有端末で前ユーザーのローカルデータが残り、次にログインした別ユーザーのアカウントへ
      // 誤同期されるのを防ぐため、ログアウト時にローカルDBを全テーブルクリアする。
      try {
        await clearLocalData();
      } catch (error) {
        console.error(error);
      }
    }
  }

  // 未同期(pending)の記録・写真・削除があっても確認なしに全消去しないよう、まず最終同期を
  // 1回試み、それでも残る未同期があれば件数を示して確認を取る。
  async function handleLogout() {
    try {
      await syncPendingChanges();
    } catch (error) {
      console.error(error);
    }
    const remaining = await countUnsyncedChanges();
    if (remaining > 0) {
      setUnsyncedOnLogout(remaining);
      return;
    }
    await signOutAndClear();
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
      {!!pendingCount && <span className="whitespace-nowrap text-[var(--accent)]">未同期{pendingCount}件</span>}
      <button
        type="button"
        onClick={handleLogout}
        className="whitespace-nowrap underline underline-offset-2 focus:ring-2 focus:ring-[var(--accent)]"
      >
        ログアウト
      </button>
      <ConfirmDialog
        open={unsyncedOnLogout !== null}
        message={`クラウドへ送れていない変更が${unsyncedOnLogout ?? 0}件あります。ログアウトするとこの端末から消えます。通信できる場所で再度お試しください。それでもログアウトしますか？`}
        confirmLabel="消してログアウト"
        cancelLabel="やめる"
        onConfirm={async () => {
          setUnsyncedOnLogout(null);
          await signOutAndClear();
        }}
        onCancel={() => setUnsyncedOnLogout(null)}
      />
    </div>
  );
}
