"use client";

import type { ReactNode } from "react";
import { AuthProvider as CoreAuthProvider } from "@note/core/auth";

// 認証の実装は @note/core/auth(あさノート・よるノートと同じ Supabase のログイン)。
// さくひんノートは端末内に記録を持たない(作品はサーバーへ直接保存する。SPEC §7)ので、同期のコールバックは渡さない。
export { useAuth } from "@note/core/auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  return <CoreAuthProvider>{children}</CoreAuthProvider>;
}
