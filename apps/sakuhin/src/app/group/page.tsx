"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@note/core/components/Skeleton";
import { GroupMemberSections } from "@note/core/components/group/GroupMemberSections";
import { GroupOnboardingSections } from "@note/core/components/group/GroupOnboardingSections";
import { runAction } from "@note/core/group/runAction";
import { useGroupAdmin } from "@note/core/group/useGroupAdmin";
import { AppHeader } from "@/components/AppHeader";
import { ChildProfilesSection } from "@/components/ChildProfilesSection";
import { SignInPrompt } from "@/components/SignInPrompt";
import { APP_NAME } from "@/lib/appConfig";
import { useChildProfiles } from "@/lib/useChildProfiles";

// 端末内に記録を持たないので、グループに参加した後にクラウドから取り込むものは無い。
async function nothingToPull() {}

// 「共有」の画面(SPEC §5.9・§6.3)。お子さま(名前・誕生日・館の名前)と、家族のグループ。
// グループ・お子さまは、あさノート・よるノートと共通(同じ Supabase の表)。
export default function GroupPage() {
  const { profiles, error: loadError, reload, authLoading, signedIn, userId } = useChildProfiles();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [groupLoading, setGroupLoading] = useState(true);

  const groupAdmin = useGroupAdmin({
    appName: APP_NAME,
    pullFromCloud: nothingToPull,
    onError: setErrorMessage,
    onJoined: reload,
  });
  const refreshGroup = groupAdmin.refresh;

  useEffect(() => {
    if (authLoading || !signedIn) return;
    void runAction(refreshGroup, "共有設定の取得に失敗しました", setErrorMessage).finally(() => setGroupLoading(false));
  }, [authLoading, signedIn, refreshGroup]);

  if (authLoading || (signedIn && (groupLoading || profiles === null))) {
    return (
      <>
        <AppHeader>
          <p className="text-[15px] font-bold">家族との共有</p>
        </AppHeader>
        <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader>
        <p className="text-[15px] font-bold">家族との共有</p>
      </AppHeader>
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-4 pb-6">
        {!signedIn || !userId ? (
          <SignInPrompt message="お子さまの登録と、家族との共有には、ログインが必要です。" />
        ) : (
          <>
            <p className="text-xs leading-relaxed text-[var(--sub)]">
              家族でグループに入ると、同じ美術館を見て、どちらでも作品を収蔵できます。グループは、あさノート・よるノートと共通です。
            </p>
            {(errorMessage ?? loadError) && (
              <p role="alert" className="rounded-xl bg-[var(--holiday-soft)] px-4 py-3 text-sm text-[var(--holiday)]">
                {errorMessage ?? loadError}
              </p>
            )}
            <ChildProfilesSection profiles={profiles ?? []} currentUserId={userId} onChanged={reload} onError={setErrorMessage} />
            {groupAdmin.group ? (
              <GroupMemberSections
                admin={groupAdmin}
                currentUserId={userId}
                leaveMessage="グループを抜けますか？家族の美術館が見えなくなり、あさノート・よるノートでもグループから抜けます。この操作は取り消せません。"
              />
            ) : (
              <GroupOnboardingSections
                admin={groupAdmin}
                createDescription="作成すると、招待コードで家族を招けます。同じグループの家族は、同じ美術館を見て、作品を収蔵できます(あさノート・よるノートの記録も共有されます)。"
              />
            )}
          </>
        )}
      </main>
    </>
  );
}
