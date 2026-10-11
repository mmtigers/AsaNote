"use client";

import { useEffect } from "react";
import { reportClientError, type ClientErrorApp } from "../clientErrors";

// ルートセグメントで発生した想定外のランタイムエラーのフォールバックUI。
// これが無いと本番では Next.js の既定画面(英語・素のスタイル)が出る。
//
// 注意: このバージョン(Next 16)の error.tsx の prop は `retry` であって `reset` ではない
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md)。
// アプリの app/error.tsx から、この画面を返す。
export function ErrorView({
  error,
  retry,
  app,
  appVersion,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  /** 渡すと、エラーを client_errors へも送る(後から原因を追えるように)。 */
  app?: ClientErrorApp;
  appVersion?: string;
}) {
  useEffect(() => {
    // 本番ではServer Component由来のエラーは digest だけが渡る。
    // サーバー側ログと突き合わせられるよう、そのまま出力しておく。
    console.error(error);
    if (app) reportClientError(app, "error-boundary", error, appVersion);
  }, [error, app, appVersion]);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-12">
      <h1 className="text-lg font-bold">エラーが発生しました</h1>
      <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-sm leading-relaxed text-[var(--sub)]">
        画面の表示中に問題が起きました。記録はこの端末に保存されているので、
        やり直すと元に戻ることがあります。
      </p>
      {error.digest && (
        <p className="text-xs text-[var(--sub)]">エラーID: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-full bg-[var(--accent)] py-3 text-sm font-bold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent)]"
      >
        やり直す
      </button>
    </main>
  );
}
