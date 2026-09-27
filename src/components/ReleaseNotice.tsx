"use client";

import { useState } from "react";
import { releases } from "@/data/releases";
import { markVersionSeen, useLastSeenVersion } from "@/lib/releaseSeen";

// トップ画面に埋め込む、アプデ情報の通知と更新履歴。1行の帯だけを常時表示し、
// タップした時だけ詳細・過去の履歴を展開する(画面を圧迫しないようにするため)。
export function ReleaseNotice() {
  const latest = releases[0];
  const lastSeenVersion = useLastSeenVersion();
  const [open, setOpen] = useState(false);

  if (!latest) return null;
  const latestVersion = latest.version;
  const isNew = lastSeenVersion !== latestVersion;

  function handleToggle() {
    setOpen((v) => !v);
    if (isNew) markVersionSeen(latestVersion);
  }

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-left text-[12px] font-semibold text-[var(--accent)]"
      >
        <span className="flex-none">{isNew ? "🆕" : "📋"}</span>
        <span className="min-w-0 flex-1 truncate">{isNew ? latest.title : "更新履歴"}</span>
        <span className="flex-none text-[10px] font-normal text-[var(--sub)]">{open ? "閉じる" : "見る"}</span>
      </button>
      {open && (
        <div className="mt-1.5 flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-[12px]">
          {releases.map((release) => (
            <div key={release.version}>
              <p className="font-bold text-[var(--ink)]">
                {release.title}{" "}
                <span className="text-[10px] font-normal text-[var(--sub)]">
                  v{release.version}・{release.date}
                </span>
              </p>
              <p className="mt-0.5 text-[var(--sub)]">{release.summary}</p>
              <ul className="mt-1 list-disc pl-4 text-[var(--sub)]">
                {release.details.map((detail, i) => (
                  <li key={i}>{detail}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
