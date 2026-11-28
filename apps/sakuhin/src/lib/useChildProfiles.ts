"use client";

import { useCallback, useEffect, useState } from "react";
import { reportHandledError } from "@note/core/clientErrors";
import { describeErrorForUser } from "@note/core/errors";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getChildProfiles, type ChildProfile } from "@/lib/db/childProfiles";

/**
 * ログイン中の人が見られるお子さま(と館の名前)。未ログイン・読み込み中は null。
 * 読み込みに失敗したときは error に日本語のメッセージを入れる。
 */
export function useChildProfiles() {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user.id ?? null;
  const [profiles, setProfiles] = useState<ChildProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((load: Promise<ChildProfile[]>) => {
    return load.then(
      (result) => {
        setProfiles(result);
        setError(null);
      },
      (e: unknown) => {
        console.error(e);
        reportHandledError("list/sakuhin-child-profiles", e);
        setError(describeErrorForUser(e, "お子さまの読み込みに失敗しました"));
        setProfiles((prev) => prev ?? []);
      },
    );
  }, []);

  const reload = useCallback(() => apply(getChildProfiles()), [apply]);

  useEffect(() => {
    if (authLoading || !userId) return;
    void apply(getChildProfiles());
  }, [authLoading, userId, apply]);

  return { profiles: userId ? profiles : null, error, reload, authLoading, signedIn: !!userId, userId };
}
