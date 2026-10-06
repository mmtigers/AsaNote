"use client";

import { useState } from "react";

interface TagChipsProps {
  options: readonly string[];
  selected: readonly string[];
  onToggle: (tag: string) => void;
  /** 渡すと「＋追加」を出す。単一選択の項目(夕食など)には渡さない。 */
  onAdd?: (tag: string) => void;
  /** 1行に等分で並べる(2〜3択の項目用)。 */
  segmented?: boolean;
}

const chipClass = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-[13px] focus:ring-2 focus:ring-[var(--accent)] ${
    on
      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
      : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
  }`;

// タップで選ぶ(複数選択可)チップの並び。「＋追加」でその場で自由入力のタグを足せる。
export function TagChips({ options, selected, onToggle, onAdd, segmented }: TagChipsProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function commit() {
    const tag = draft.trim();
    if (tag && onAdd) onAdd(tag);
    setDraft("");
    setAdding(false);
  }

  return (
    <div className={segmented ? "flex gap-1.5" : "flex flex-wrap gap-1.5"}>
      {options.map((tag) => {
        const on = selected.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(tag)}
            className={`${chipClass(on)} ${segmented ? "flex-1 py-2.5" : ""}`}
          >
            {tag}
          </button>
        );
      })}
      {onAdd &&
        (adding ? (
          <span className="flex items-center gap-1">
            <input
              aria-label="タグ名"
              autoFocus
              value={draft}
              maxLength={30}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  commit();
                }
              }}
              placeholder="タグ名"
              className="w-28 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[13px]"
            />
            <button type="button" onClick={commit} className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-[13px] font-semibold text-[var(--accent)]">
              追加
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-full border border-dashed border-[var(--line)] px-3 py-1.5 text-[13px] text-[var(--sub)] focus:ring-2 focus:ring-[var(--accent)]"
          >
            ＋追加
          </button>
        ))}
    </div>
  );
}
