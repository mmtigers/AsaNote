import type { ReactNode } from "react";

// 画面上部のヘッダー。形は、あさノートの RecordHeader にそろえる(SPEC §6.3)。
// 2段目には、画面の名前や「← もどる」を置く。
export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--bg)]/95 px-4 pt-5 pb-3 backdrop-blur-sm">
      <div className="mx-auto max-w-md">
        <h1 className="whitespace-nowrap text-xl font-bold">🎨 さくひんノート</h1>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </header>
  );
}
