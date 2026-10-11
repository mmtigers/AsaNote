"use client";

import { useEffect } from "react";
import { reportClientError, type ClientErrorApp } from "../clientErrors";

/**
 * error.tsx では捕まらないエラー(イベントハンドラ・非同期処理の例外、握りつぶされた Promise の
 * reject)を拾って client_errors へ送る。ルートレイアウトに1つ置く。
 */
export function ClientErrorReporter({ app, appVersion }: { app: ClientErrorApp; appVersion?: string }) {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      // リソース(画像など)の読み込み失敗は event.error が無いので、ここでは拾わない。
      if (!event.error) return;
      reportClientError(app, "window-error", event.error, appVersion);
    }
    function onRejection(event: PromiseRejectionEvent) {
      reportClientError(app, "unhandled-rejection", event.reason, appVersion);
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [app, appVersion]);

  return null;
}
