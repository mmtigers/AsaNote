"use client";

import { ReleaseNotice as ReleaseNoticeView } from "@note/core/components/ReleaseNotice";
import { releases } from "@/data/releases";
import { useLastSeenVersion } from "@/lib/releaseSeen";

// 表示は @note/core。このアプリのリリース一覧(releases)と、最後に見たバージョンを渡す。
export function ReleaseNotice() {
  const lastSeenVersion = useLastSeenVersion();
  return <ReleaseNoticeView latest={releases[0]} lastSeenVersion={lastSeenVersion} />;
}
