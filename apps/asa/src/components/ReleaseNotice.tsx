"use client";

import Link from "next/link";
import { releases } from "@/data/releases";
import { useLastSeenVersion } from "@/lib/releaseSeen";
import { formatDateShort } from "@note/core/date";

// トップ画面に埋め込む、最新アプデの案内。1行のみ表示し、詳細・全履歴は
// /updates ページに任せる(バージョンを重ねるほど詳細をここで展開すると
// 画面が埋まってしまうため)。
export function ReleaseNotice() {
  const latest = releases[0];
  const lastSeenVersion = useLastSeenVersion();

  if (!latest) return null;
  const isNew = lastSeenVersion !== latest.version;

  return (
    <Link
      href="/updates"
      className="mb-3 flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--accent)]"
    >
      <span className="flex-none">{isNew ? "🆕" : "📋"}</span>
      <span className="min-w-0 flex-1 truncate">
        {isNew ? `${formatDateShort(latest.date)}に更新しました` : "更新履歴"}
      </span>
      <span className="flex-none text-[10px] font-normal text-[var(--sub)]">詳細</span>
    </Link>
  );
}
