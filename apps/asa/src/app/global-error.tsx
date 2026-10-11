"use client"; // エラーバウンダリはClient Componentである必要がある

import { useEffect } from "react";
import { reportClientError } from "@note/core/clientErrors";
import { releases } from "@/data/releases";

// ルートレイアウト自身でエラーが起きたときの最後の砦。
// error.tsx は同じセグメントの layout.tsx を包まないため、そこで throw された場合は
// こちらが使われる(node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md)。
//
// このファイルはルートレイアウトを置き換えるため、以下の制約がある:
//  - <html> / <body> を自分で持つ必要がある
//  - globals.css が読み込まれない。そのため --bg 等のCSS変数は使えず、配色をここに持つ
//    (globals.css と同じ値を最小限だけ複製している。色を変えるときは両方直すこと)
//  - metadata / generateMetadata は使えないので、タイトルは React の <title> で指定する
//
// prop は `retry` であって `reset` ではない(Next 16)。
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
    reportClientError("asa", "error-boundary", error, releases[0]?.version);
  }, [error]);

  return (
    <html lang="ja">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontFamily: "system-ui, sans-serif",
          background: "var(--ge-bg)",
          color: "var(--ge-ink)",
        }}
      >
        <title>エラーが発生しました | あさノート</title>
        <style>{`
          :root {
            --ge-bg: #fff5f6;
            --ge-surface: #fdecef;
            --ge-ink: #4a3640;
            --ge-sub: #9c7f89;
            --ge-accent: #e0668a;
            --ge-accent-ink: #ffffff;
            color-scheme: light;
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --ge-bg: #241821;
              --ge-surface: #3a2530;
              --ge-ink: #f6e7eb;
              --ge-sub: #cba7b2;
              --ge-accent: #f18ba9;
              --ge-accent-ink: #2b121a;
              color-scheme: dark;
            }
          }
        `}</style>
        <main style={{ width: "100%", maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 700 }}>
            エラーが発生しました
          </h1>
          <p
            style={{
              marginTop: "16px",
              borderRadius: "16px",
              background: "var(--ge-surface)",
              padding: "24px 16px",
              fontSize: "0.875rem",
              lineHeight: 1.7,
              color: "var(--ge-sub)",
            }}
          >
            アプリの読み込み中に問題が起きました。記録はこの端末に保存されているので、
            やり直しても消えません。
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: "12px",
                fontSize: "0.75rem",
                color: "var(--ge-sub)",
              }}
            >
              エラーID: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: "16px",
              width: "100%",
              borderRadius: "9999px",
              border: "none",
              background: "var(--ge-accent)",
              color: "var(--ge-accent-ink)",
              padding: "12px",
              fontSize: "0.875rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            やり直す
          </button>
        </main>
      </body>
    </html>
  );
}
