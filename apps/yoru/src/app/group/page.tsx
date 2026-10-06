"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@note/core/components/Skeleton";
import { useAuth } from "@/lib/auth/AuthProvider";
import { ChildrenSection } from "./ChildrenSection";
import { NotificationSection } from "./NotificationSection";
import { GroupMemberSections } from "./GroupMemberSections";
import { GroupOnboardingSections } from "./GroupOnboardingSections";
import { runAction } from "@note/core/group/runAction";
import { useChildrenAdmin } from "./useChildrenAdmin";
import { useNotificationSettings } from "./useNotificationSettings";
import { useGroupAdmin } from "./useGroupAdmin";

// この画面は「お子さま」と「グループ」という独立した2つの関心を並べたもの。
// それぞれの状態と操作は use*Admin フックに、表示は *Section コンポーネントに分けてあり(#62)、
// ここに残すのはログイン状態による出し分けと、共通のエラー表示だけ。
export default function GroupPage() {
  const { session, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const childrenAdmin = useChildrenAdmin(setErrorMessage);
  const reloadChildren = childrenAdmin.reload;
  const groupAdmin = useGroupAdmin({ onError: setErrorMessage, onJoined: reloadChildren });
  const refreshGroup = groupAdmin.refresh;
  const notificationAdmin = useNotificationSettings(session?.user.id, setErrorMessage);

  const refresh = useCallback(async () => {
    await refreshGroup();
    await reloadChildren();
  }, [refreshGroup, reloadChildren]);

  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 未ログイン確定後に一度だけローディング表示を止める後始末で、フェッチ自体は発生しない
      setLoading(false);
      return;
    }
    runAction(refresh, "共有設定の取得に失敗しました", setErrorMessage).finally(() =>
      setLoading(false)
    );
  }, [authLoading, session, refresh]);

  if (authLoading || loading) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-6 px-4 pt-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-8">
        <h1 className="text-lg font-bold">家族との共有</h1>
        <p className="text-sm text-[var(--sub)]">記録を共有するにはログインが必要です。</p>
        <Link
          href="/login"
          className="rounded-full bg-[var(--accent)] py-3 text-center text-sm font-semibold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent)]"
        >
          ログインする
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 pt-6">
      <header>
        <h1 className="text-lg font-bold">家族との共有</h1>
        <p className="mt-1 text-xs text-[var(--sub)]">
          夫婦・家族単位で記録を共有できます。グループに入ると、どちらが記録しても両方のスマホから見えるようになります。
        </p>
      </header>

      {errorMessage && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{errorMessage}</p>
      )}

      <ChildrenSection admin={childrenAdmin} />

      <NotificationSection admin={notificationAdmin} />

      {groupAdmin.group ? (
        <GroupMemberSections admin={groupAdmin} currentUserId={session.user.id} />
      ) : (
        <GroupOnboardingSections admin={groupAdmin} />
      )}
    </main>
  );
}
