"use client";

import { UNASSIGNED_FILTER } from "../childFilter";
import type { Child } from "../types/group";

interface ChildSwitcherProps {
  childList: Child[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  // タイムライン・傾向のような閲覧画面では「すべて」の記録も見られるようにする。
  // 記録フォーム(ホーム画面)では新しい記録は必ず特定の子どもに紐づくため出さない。
  allowAll?: boolean;
  // 子ども未分類(childId が無い)の記録だけを見る選択肢を出す。未分類の記録がある閲覧画面でだけ true にする。
  // 選ぶと onSelect に UNASSIGNED_FILTER が渡る(#127)。
  allowUnassigned?: boolean;
}

// 子どもが2人以上いる家庭でのみ意味を持つ切り替えUI。呼び出し側で
// childList.length <= 1 の間はレンダリングしないこと。
export function ChildSwitcher({ childList, selectedId, onSelect, allowAll = false, allowUnassigned = false }: ChildSwitcherProps) {
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
      {allowUnassigned && (
        <button
          type="button"
          onClick={() => onSelect(UNASSIGNED_FILTER)}
          className={`flex-none rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
            selectedId === UNASSIGNED_FILTER
              ? "bg-[var(--accent)] text-[var(--accent-ink)]"
              : "bg-[var(--surface-2)] text-[var(--sub)]"
          }`}
        >
          未分類
        </button>
      )}
    </div>
  );
}
