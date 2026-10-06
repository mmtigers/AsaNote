"use client";

import Link from "next/link";
import { useEffect } from "react";
import { releases } from "@/data/releases";
import { markVersionSeen } from "@/lib/releaseSeen";

// アプデの全履歴を表示する専用ページ。トップ画面のバナーには最新版の日付だけを
// 出し、詳細はここに集約する(バージョンを重ねるほどトップ画面が埋まるのを防ぐ)。
export default function UpdatesPage() {
  useEffect(() => {
    const latest = releases[0];
    if (latest) markVersionSeen(latest.version);
  }, []);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6 pb-10">
      <header>
        <Link href="/" className="text-xs text-[var(--accent)] underline underline-offset-2">
          ← ホームに戻る
        </Link>
        <h1 className="mt-1 text-lg font-bold">更新履歴</h1>
      </header>

      <ul className="flex flex-col gap-4">
        {releases.map((release) => (
          <li
            key={release.version}
            className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5"
          >
            <p className="text-sm font-bold text-[var(--ink)]">
              {release.title}{" "}
              <span className="text-[11px] font-normal text-[var(--sub)]">
                v{release.version}・{release.date}
              </span>
            </p>
            <p className="mt-1 text-[13px] text-[var(--sub)]">{release.summary}</p>
            <ul className="mt-2 list-disc pl-4 text-[13px] text-[var(--sub)]">
              {release.details.map((detail, i) => (
                <li key={i}>{detail}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </main>
  );
}
