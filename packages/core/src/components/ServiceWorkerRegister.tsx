"use client";

import { useEffect } from "react";

/**
 * Service Worker(/sw.js)を登録する。登録のあとにアプリ固有の処理(同期のリスナー登録など)が要るなら
 * `onRegistered` で渡す(モジュールレベルの安定した関数にすること)。
 */
export function ServiceWorkerRegister({ onRegistered }: { onRegistered?: () => void }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("Service worker registration failed:", error);
      });
    }

    onRegistered?.();
  }, [onRegistered]);

  return null;
}
