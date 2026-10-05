"use client";

import { useState } from "react";

interface MilestoneRowProps {
  label: string;
  value: string | undefined;
  /** 候補ボタン(3つ)。 */
  candidates: readonly string[];
  /** 「ほか」の選択メニュー。 */
  menu: readonly string[];
  onChange: (value: string | undefined) => void;
}

const buttonClass = (on: boolean) =>
  `rounded-xl border py-2.5 text-sm font-bold focus:ring-2 focus:ring-[var(--accent)] ${
    on
      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
      : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
  }`;

// 節目の時刻を、3つの候補ボタンと「ほか」(選択メニュー)から選ぶ。もう一度押すと解除する。
export function MilestoneRow({ label, value, candidates, menu, onChange }: MilestoneRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const custom = value && !candidates.includes(value) ? value : null;

  return (
    <div className="border-b border-dashed border-[var(--line)] py-2 last:border-b-0">
      <p className="mb-1 text-[13px] text-[var(--sub)]">{label}</p>
      <div className="flex gap-1.5">
        {candidates.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={value === t}
            onClick={() => {
              setMenuOpen(false);
              onChange(value === t ? undefined : t);
            }}
            className={`${buttonClass(value === t)} flex-1`}
          >
            {t}
          </button>
        ))}
        <button
          type="button"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className={`${buttonClass(!!custom)} px-3 ${custom ? "" : "font-normal text-[var(--sub)]"}`}
        >
          {custom ? `${custom}ごろ` : "ほか"}
        </button>
      </div>
      {menuOpen && (
        <select
          aria-label={`${label}のほかの時刻`}
          value={custom ?? ""}
          onChange={(e) => {
            onChange(e.target.value || undefined);
            setMenuOpen(false);
          }}
          className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2 text-sm"
        >
          <option value="">ほかの時刻を選ぶ</option>
          {menu.map((t) => (
            <option key={t} value={t}>
              {t}ごろ
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
