"use client";

import { useEffect, useState } from "react";
import { checkLocalDb, type LocalDbHealth } from "@/lib/db/localDb";

// 端末内のデータベースが開けないとき、その原因を画面に出す。
export function LocalDbNotice() {
  const [health, setHealth] = useState<LocalDbHealth | null>(null);

  useEffect(() => {
    let cancelled = false;
    void checkLocalDb().then((h) => {
      if (!cancelled) setHealth(h);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!health || health.ok) return null;
  return (
    <div role="alert" className="fixed inset-x-4 top-4 z-50 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-xs shadow-lg">
      <p className="font-bold">この端末では記録を保存する領域が使えません</p>
      <p className="mt-1 text-[var(--sub)]">
        シークレットモードでないか、Chromeのサイトデータが許可されているか、端末の空き容量を確認してください。
      </p>
      <p className="mt-2 break-all font-mono text-[var(--sub)]">
        {health.name}: {health.message}
      </p>
    </div>
  );
}
