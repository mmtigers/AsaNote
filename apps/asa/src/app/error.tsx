"use client"; // エラーバウンダリはClient Componentである必要がある

import { ErrorView } from "@note/core/components/ErrorView";
import { releases } from "@/data/releases";

// 画面は @note/core。Next 16 の error.tsx の prop は `retry`(`reset` ではない)。
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorView error={error} retry={retry} app="asa" appVersion={releases[0]?.version} />;
}
