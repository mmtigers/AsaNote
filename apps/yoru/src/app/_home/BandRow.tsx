"use client";

import { useState } from "react";

interface BandRowProps {
  label: string;
  /** 選んでいる値。帯のid、または「ほか」で選んだ "HH:MM"。 */
  value: string | undefined;
  bands: readonly { id: string; label: string }[];
  /** 「ほか」の選択メニュー。無ければ「ほか」は出さない。 */
  menu?: readonly string[];
  onChange: (value: string | undefined) => void;
}

const buttonClass = (on: boolean) =>
  `rounded-xl border py-2.5 text-sm font-bold focus:ring-2 focus:ring-[var(--accent)] ${
    on
      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
      : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
  }`;

// 節目を、3つの時間帯ボタンと「ほか」(時刻の選択メニュー)から選ぶ。もう一度押すと解除する。
export function BandRow({ label, value, bands, menu, onChange }: BandRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const custom = value && !bands.some((b) => b.id === value) ? value : null;

  return (
    <div className="border-b border-dashed border-[var(--line)] py-2 last:border-b-0">
      <p className="mb-1 text-[13px] text-[var(--sub)]">{label}</p>
      <div className="flex gap-1.5">
        {bands.map((b) => {
          const on = value === b.id;
          return (
            <button
              key={b.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setMenuOpen(false);
                onChange(on ? undefined : b.id);
              }}
              className={`${buttonClass(on)} flex-1`}
            >
              {b.label}
            </button>
          );
        })}
        {menu && (
          <button
            type="button"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className={`${buttonClass(!!custom)} px-3 ${custom ? "" : "font-normal text-[var(--sub)]"}`}
          >
            {custom ? `${custom}ごろ` : "ほか"}
          </button>
        )}
      </div>
      {menu && menuOpen && (
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
