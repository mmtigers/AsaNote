"use client";

import { useId, useState } from "react";
import { normalizeTag, TAG_MAX_LENGTH } from "@/lib/normalizeTag";

interface TagChipsProps {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  onAddCustom?: (tag: string) => void;
}

// 記録フォームの選択肢チップ(複数選択。もう一度押すと解除)。
// 「＋追加」でその場でカスタムタグを増やせる。
//
// 以前は multiple?: boolean を受けて単一選択にもできたが、渡している呼び出し元が
// 一度も無く到達不能な分岐だったため撤去した(#62)。単一選択が必要になったら戻す。
export function TagChips({ options, value, onChange, onAddCustom }: TagChipsProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const hintId = useId();

  function toggle(option: string) {
    const selected = value.includes(option);
    onChange(selected ? value.filter((v) => v !== option) : [...value, option]);
  }

  function commitDraft() {
    // 末尾の「、」「。」などは除く。付いたまま保存すると別のタグとして数えられ、CSVの区切りとも紛らわしい。
    const normalized = normalizeTag(draft);
    setAdding(false);
    setDraft("");
    if (!normalized) return;
    if (!options.includes(normalized)) onAddCustom?.(normalized);
    if (!value.includes(normalized)) onChange([...value, normalized]);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = value.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => toggle(option)}
            className={`rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
              selected
                ? "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]"
                : "bg-[var(--surface-2)] text-[var(--ink)] border border-[var(--line)]"
            }`}
          >
            {option}
          </button>
        );
      })}
      {onAddCustom &&
        (adding ? (
          <>
            <input
              autoFocus
              value={draft}
              maxLength={TAG_MAX_LENGTH}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e) => e.key === "Enter" && commitDraft()}
              placeholder="自由に入力"
              aria-describedby={hintId}
              className="w-28 rounded-full border border-[var(--accent)] bg-[var(--surface)] px-3 py-1.5 text-[13px] text-[var(--ink)] outline-none"
            />
            <p id={hintId} className="basis-full text-[11px] text-[var(--sub)]">
              {TAG_MAX_LENGTH}文字まで。長い内容はメモ欄に書いてね
            </p>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-full border border-dashed border-[var(--line)] px-3.5 py-2 text-[13px] text-[var(--sub)]"
          >
            + 追加
          </button>
        ))}
    </div>
  );
}
