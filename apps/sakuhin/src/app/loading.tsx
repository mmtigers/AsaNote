import { LoadingView } from "@note/core/components/LoadingView";

// ルートセグメントの読み込み中に出す共通のフォールバック。画面は @note/core。
export default function Loading() {
  return <LoadingView />;
}
