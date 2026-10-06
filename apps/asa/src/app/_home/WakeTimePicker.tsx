"use client";

import { WAKE_SLOTS, wakeSlotOfTimeValue } from "@/lib/wakeTime";

interface WakeTimePickerProps {
  value: string; // "HH:MM"、未入力は空文字
  onChange: (next: string) => void;
}

// 起床時刻の入力。DepartTimePickerと同じく3つの区分から1つ選ぶ。もう一度押すと解除。
export function WakeTimePicker({ value, onChange }: WakeTimePickerProps) {
  const selected = wakeSlotOfTimeValue(value);

  return (
    <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
      <h2 className="mb-3 text-[15px] font-bold">⏰ 朝起きた時間は？</h2>
      <div className="flex flex-wrap gap-2">
        {WAKE_SLOTS.map((slot) => {
          const isSelected = selected?.key === slot.key;
          return (
            <button
              key={slot.key}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onChange(isSelected ? "" : slot.value)}
              className={`rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                isSelected
                  ? "border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
              }`}
            >
              {slot.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
