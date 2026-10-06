"use client";

import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getSupabaseClient } from "./supabase/client";

interface AuthState {
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export interface AuthProviderProps {
  children: ReactNode;
  /** 既にログイン済みの状態でアプリを開いた(=起動時にセッションを復元できた)とき。 */
  onSessionRestored?: () => void;
  /** 新規ログイン(マジックリンク経由)のとき。`SIGNED_IN` の時だけ呼ぶ(TOKEN_REFRESHED 等では呼ばない)。 */
  onSignedIn?: () => void;
  /** ログイン中に認証状態が変わるたび(セッションがあるとき)。 */
  onSessionActive?: () => void;
}

/**
 * Supabase の認証状態を、アプリ全体へ配る。
 *
 * クラウドとの同期は**このアプリ(@note/core)の外の関心事**なので、同期の呼び出しはコールバックで受け取る
 * (アプリごとの `lib/auth/AuthProvider.tsx` が、自分の `sync.ts` の関数を渡す)。
 * コールバックは**モジュールレベルの安定した関数**を渡すこと(変わるたびに購読をやり直すため)。
 */
export function AuthProvider({ children, onSessionRestored, onSignedIn, onSessionActive }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    // アンマウント後に init() が解決したとき、購読を張りっぱなしにしないためのガード。
    let cancelled = false;

    // 環境変数未設定(Supabase未接続)の状態でもアプリ自体は動くようにする。
    async function init() {
      let supabase;
      try {
        supabase = getSupabaseClient();
      } catch {
        setLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      setLoading(false);
      // 既にログイン済みの状態でアプリを開いた場合(=起動時)、この端末のIndexedDBが空
      // (再インストール・別端末)でもクラウドの記録を復元できるようにする。
      if (data.session) onSessionRestored?.();

      const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
        setSession(nextSession);
        // SIGNED_IN は新規ログイン(マジックリンク経由)時にのみ発火する。
        // TOKEN_REFRESHED 等の度に毎回 pull すると無駄なので絞る。
        if (event === "SIGNED_IN") onSignedIn?.();
        if (nextSession) onSessionActive?.();
      });
      unsubscribe = () => listener.subscription.unsubscribe();
    }

    void init();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [onSessionRestored, onSignedIn, onSessionActive]);

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
