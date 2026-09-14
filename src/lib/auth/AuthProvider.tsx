"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { pullFromCloud, syncPendingChanges } from "@/lib/db/sync";
import { getSupabaseClient } from "@/lib/supabase/client";

interface AuthState {
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    // 環境変数未設定(Supabase未接続)の状態でもアプリ自体はオフラインで使えるようにする。
    async function init() {
      let supabase;
      try {
        supabase = getSupabaseClient();
      } catch {
        setLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setLoading(false);
      // 既にログイン済みの状態でアプリを開いた場合(=起動時)、この端末のIndexedDBが
      // 空(再インストール・別端末)でもクラウドの記録を復元できるようにする。
      if (data.session) void pullFromCloud();

      const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
        setSession(nextSession);
        // SIGNED_INは新規ログイン(マジックリンク経由)時にのみ発火する。
        // TOKEN_REFRESHED等の度に毎回pullすると無駄なので絞る。
        if (event === "SIGNED_IN") void pullFromCloud();
        if (nextSession) void syncPendingChanges();
      });
      unsubscribe = () => listener.subscription.unsubscribe();
    }

    void init();

    return () => unsubscribe?.();
  }, []);

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
