import { Skeleton } from "./Skeleton";

// ルートセグメントの読み込み中に出す共通のフォールバック(#62)。
// 各ページが自前で出すスケルトン(例: group/page.tsx)と形を揃え、
// 「ヘッダー1行 + カード2枚」の骨格だけを見せる。アプリの app/loading.tsx から、この画面を返す。
export function LoadingView() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 pt-6" aria-busy="true">
      <span className="sr-only">読み込み中</span>
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </main>
  );
}
