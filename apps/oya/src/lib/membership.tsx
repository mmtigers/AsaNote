"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@note/core/auth";
import { fetchMyMembership, type Member } from "@/lib/db/family";

// ログイン中の人が、どの家族に・どの役割で属しているか。画面の出し分けに使う。
// 画面の出し分けは表示のためだけで、権限の検証はサーバー(RLS と DB の関数)が行う。
export type MembershipState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "no-family"; userId: string }
  | { status: "member"; userId: string; member: Member }
  | { status: "error"; userId: string; error: unknown };

interface MembershipContextValue {
  state: MembershipState;
  /** 参加・脱退・役割の変更の後に呼び、所属を読み直す。 */
  refresh: () => Promise<void>;
}

const MembershipContext = createContext<MembershipContextValue>({
  state: { status: "loading" },
  refresh: async () => {},
});

export function MembershipProvider({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const userId = session?.user.id ?? null;
  const [state, setState] = useState<MembershipState>({ status: "loading" });

  const load = useCallback(async (uid: string) => {
    try {
      const member = await fetchMyMembership(uid);
      setState(member ? { status: "member", userId: uid, member } : { status: "no-family", userId: uid });
    } catch (error) {
      setState({ status: "error", userId: uid, error });
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ログイン状態(外部の状態)の変化を反映する
      setState({ status: "signed-out" });
      return;
    }
    setState({ status: "loading" });
    void load(userId);
  }, [loading, userId, load]);

  const refresh = useCallback(async () => {
    if (userId) await load(userId);
  }, [userId, load]);

  return <MembershipContext.Provider value={{ state, refresh }}>{children}</MembershipContext.Provider>;
}

export function useMembership(): MembershipContextValue {
  return useContext(MembershipContext);
}
