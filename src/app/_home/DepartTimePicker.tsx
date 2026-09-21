"use client";

import { DEPART_SLOTS, slotOfTimeValue } from "@/lib/departTime";

interface DepartTimePickerProps {
  value: string; // "HH:MM"、未入力は空文字
  onChange: (next: string) => void;
}

// 出発時刻の入力。朝に分単位で入力させず、3つの区分から1つ選ぶだけにする。
// もう一度押すと解除(未入力に戻る)。TagChipsと同じ操作感に揃えてある。
export function DepartTimePicker({ value, onChange }: DepartTimePickerProps) {
  const selected = slotOfTimeValue(value);

  return (
    <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
      <h2 className="mb-1 text-[15px] font-bold">🕗 出発した時刻は？</h2>
      <p className="mb-3 text-[12px] text-[var(--sub)]">選ぶだけでOK。入力しなくても保存できます。</p>
      <div className="flex flex-wrap gap-2">
        {DEPART_SLOTS.map((slot) => {
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
