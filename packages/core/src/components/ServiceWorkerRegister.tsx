"use client";

import { useEffect } from "react";
import { CACHE_STATIC_URLS_MESSAGE, collectStaticAssetPaths } from "../staticAssets";

/**
 * Service Worker(/sw.js)を登録する。登録のあとにアプリ固有の処理(同期のリスナー登録など)が要るなら
 * `onRegistered` で渡す(モジュールレベルの安定した関数にすること)。解除用の関数を返せば、アンマウント時に呼ぶ。
 */
export function ServiceWorkerRegister({ onRegistered }: { onRegistered?: () => void | (() => void) }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then((registration) => {
          // 初回訪問で、Service Worker が有効になる前に読み込んだ JS/CSS も、オフラインで開けるように
          // キャッシュさせる(#133)。キャッシュ済みのものは Service Worker 側で飛ばす。
          const paths = collectStaticAssetPaths(performance.getEntriesByType("resource"), window.location.origin);
          if (paths.length > 0) registration.active?.postMessage({ type: CACHE_STATIC_URLS_MESSAGE, paths });
        })
        .catch((error) => {
          console.error("Service worker registration failed:", error);
        });
    }

    return onRegistered?.();
  }, [onRegistered]);

  return null;
}
