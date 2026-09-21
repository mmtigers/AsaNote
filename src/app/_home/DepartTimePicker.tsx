"use client";

import type { ChangeEvent } from "react";
import { hourOptions, joinTimeValue, minuteOptions, splitTimeValue } from "@/lib/departTime";

interface DepartTimePickerProps {
  value: string; // "HH:MM"、未入力は空文字
  onChange: (next: string) => void;
}

const SELECT_CLASS =
  "rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-base font-medium tabular-nums text-[var(--ink)]";

// 出発時刻の入力。朝にキーボードを出さずに済むよう、時・分とも選択式にする。
export function DepartTimePicker({ value, onChange }: DepartTimePickerProps) {
  const { hour, minute } = splitTimeValue(value);

  return (
    <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
      <h2 className="mb-1 text-[15px] font-bold">🕗 出発した時刻は？</h2>
      <p className="mb-3 text-[12px] text-[var(--sub)]">選ぶだけでOK。入力しなくても保存できます。</p>
      <div className="flex items-center gap-2">
        <select
          aria-label="出発時刻(時)"
          value={hour}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(joinTimeValue(e.target.value, minute))}
          className={SELECT_CLASS}
        >
          <option value="">--</option>
          {hourOptions().map((h) => (
            <option key={h} value={h}>
              {Number(h)}時
            </option>
          ))}
        </select>
        <select
          aria-label="出発時刻(分)"
          value={minute}
          disabled={hour === ""}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(joinTimeValue(hour, e.target.value))}
          className={`${SELECT_CLASS} disabled:opacity-50`}
        >
          <option value="">--</option>
          {minuteOptions(minute).map((m) => (
            <option key={m} value={m}>
              {Number(m)}分
            </option>
          ))}
        </select>
        {value !== "" && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="ml-auto rounded-full border border-[var(--line)] px-3 py-1.5 text-[12px] text-[var(--sub)]"
          >
            クリア
          </button>
        )}
      </div>
    </section>
  );
}
