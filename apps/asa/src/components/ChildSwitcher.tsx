"use client";

import type { Child } from "@/types/models";

interface ChildSwitcherProps {
  childList: Child[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  // タイムライン・傾向のような閲覧画面では「すべて」の記録も見られるようにする。
  // 記録フォーム(ホーム画面)では新しい記録は必ず特定の子どもに紐づくため出さない。
  allowAll?: boolean;
}

// 子どもが2人以上いる家庭でのみ意味を持つ切り替えUI。呼び出し側で
// childList.length <= 1 の間はレンダリングしないこと。
export function ChildSwitcher({ childList, selectedId, onSelect, allowAll = false }: ChildSwitcherProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {allowAll && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`flex-none rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
            selectedId === null
              ? "bg-[var(--accent)] text-[var(--accent-ink)]"
              : "bg-[var(--surface-2)] text-[var(--sub)]"
          }`}
        >
          すべて
        </button>
      )}
      {childList.map((child) => (
        <button
          key={child.id}
          type="button"
          onClick={() => onSelect(child.id)}
          className={`flex-none rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
            child.id === selectedId
              ? "bg-[var(--accent)] text-[var(--accent-ink)]"
              : "bg-[var(--surface-2)] text-[var(--sub)]"
          }`}
        >
          {child.name}
        </button>
      ))}
    </div>
  );
}
