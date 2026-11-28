"use client";

import { reportHandledError } from "@note/core/clientErrors";
import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "@note/core/components/ConfirmDialog";
import { useAuth } from "@/lib/auth/AuthProvider";
import { clearThisDevice } from "@/lib/auth/clearThisDevice";
import { removeThisDevicePushSubscription } from "@/lib/db/notificationSettings";
import { usePendingSyncCount } from "@/lib/db/queries";
import { countUnsyncedChanges } from "@/lib/db/records";
import { syncPendingChanges } from "@/lib/db/sync";
import { getSupabaseClient } from "@note/core/supabase/client";

// ホーム画面のヘッダーに置く、ログイン状態の表示。
export function AuthStatus() {
  const { session, loading } = useAuth();
  const pendingCount = usePendingSyncCount();
  // ログアウト時に消えてしまう未同期件数。null のときはダイアログ非表示。
  const [unsyncedOnLogout, setUnsyncedOnLogout] = useState<number | null>(null);

  async function signOutAndClear() {
    // この端末のPush購読(ブラウザ側とサーバーの行)を解除する(#131)。サーバーの行の削除は
    // ログイン中でないとできないため、サインアウトの前に行う。失敗してもログアウトは続ける。
    try {
      await removeThisDevicePushSubscription();
    } catch (error) {
      console.error(error);
      reportHandledError("auth/push-unsubscribe", error);
    }
    try {
      await getSupabaseClient().auth.signOut();
    } catch (error) {
      console.error(error);
      reportHandledError("auth/sign-out", error);
    } finally {
      // ログアウトしたら、この端末のデータを消す(退会と共通。clearThisDevice.ts)。
      await clearThisDevice();
    }
  }

  // 未同期(pending)の記録・写真・削除があっても確認なしに全消去しないよう、まず最終同期を
  // 1回試み、それでも残る未同期があれば件数を示して確認を取る。
  async function handleLogout() {
    try {
      await syncPendingChanges();
    } catch (error) {
      console.error(error);
      reportHandledError("auth/sync-before-logout", error);
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
