"use client"; // エラーバウンダリはClient Componentである必要がある

import { useEffect } from "react";

// ルートセグメントで発生した想定外のランタイムエラーの画面。
// core の ErrorView は「記録はこの端末に保存されている」前提の文言で、記録をオンラインで保存する
// このアプリには合わないため、ここに持つ。エラーの送信(client_errors)は、DB を用意するまで行わない。
// Next 16 の error.tsx の prop は `retry`(`reset` ではない)。
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-12">
      <h1 className="text-lg font-bold">エラーが発生しました</h1>
      <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-base leading-relaxed text-[var(--sub)]">
        画面の表示中に問題が起きました。「やり直す」を押すと、元に戻ることがあります。
      </p>
      {error.digest && <p className="text-xs text-[var(--sub)]">エラーID: {error.digest}</p>}
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-full bg-[var(--accent)] py-3 text-base font-bold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent)]"
      >
        やり直す
      </button>
    </main>
  );
}
