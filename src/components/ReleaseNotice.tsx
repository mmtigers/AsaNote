"use client";

import { useState } from "react";
import { releases } from "@/data/releases";
import { markVersionSeen, useLastSeenVersion } from "@/lib/releaseSeen";

// トップ画面に埋め込む、アプデ情報の通知(新着があれば数行表示・タップで詳細展開)と
// 更新履歴の一覧(常に開閉できる)。RecordReminderNotice と同様、固定表示のトースト
// ではなく通常のブロックとして流し込む。
export function ReleaseNotice() {
  const latest = releases[0];
  const lastSeenVersion = useLastSeenVersion();
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  if (!latest) return null;
  const latestVersion = latest.version;
  const isNew = lastSeenVersion !== latestVersion;

  function handleToggleExpand() {
    setExpanded((v) => !v);
    if (isNew) markVersionSeen(latestVersion);
  }

  return (
    <div className="mb-4 flex flex-col gap-2">
      {isNew && (
        <button
          type="button"
          onClick={handleToggleExpand}
          className="rounded-2xl bg-[var(--accent-soft)] px-4 py-3 text-left text-[13px] text-[var(--accent)]"
        >
          <p className="font-bold">🆕 {latest.title}</p>
          <p className="mt-0.5 text-[var(--sub)]">{latest.summary}</p>
        </button>
      )}
      {isNew && expanded && (
        <div className="rounded-2xl bg-[var(--surface-2)] px-4 py-3 text-[13px] text-[var(--ink)]">
          <ul className="list-disc pl-4">
            {latest.details.map((detail, i) => (
              <li key={i}>{detail}</li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        onClick={() => setShowHistory((v) => !v)}
        className="self-start text-[12px] text-[var(--sub)] underline underline-offset-2"
      >
        {showHistory ? "更新履歴を閉じる" : "📋 更新履歴を見る"}
      </button>
      {showHistory && (
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[13px]">
          {releases.map((release) => (
            <div key={release.version}>
              <p className="font-bold">
                v{release.version} {release.title}{" "}
                <span className="text-[11px] font-normal text-[var(--sub)]">({release.date})</span>
              </p>
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
