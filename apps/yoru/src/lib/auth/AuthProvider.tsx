"use client";

import type { ReactNode } from "react";
import { AuthProvider as CoreAuthProvider } from "@note/core/auth";
import { pullFromCloud, syncPendingChanges } from "@/lib/db/sync";

// 認証の実装は @note/core/auth。クラウドとの同期(このアプリの sync.ts)の呼び出しだけを、コールバックで渡す。
export { useAuth } from "@note/core/auth";

// コールバックは変わるたびに購読をやり直すため、モジュールレベルの安定した関数にしてある。
function restoreFromCloud() {
  void pullFromCloud();
}

function pushPendingChanges() {
  void syncPendingChanges();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <CoreAuthProvider onSessionRestored={restoreFromCloud} onSignedIn={restoreFromCloud} onSessionActive={pushPendingChanges}>
      {children}
    </CoreAuthProvider>
  );
}
