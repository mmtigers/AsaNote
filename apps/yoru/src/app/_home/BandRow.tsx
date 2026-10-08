"use client";

interface BandRowProps {
  label: string;
  /** 選んでいる帯のid。 */
  value: string | undefined;
  bands: readonly { id: string; label: string }[];
  onChange: (value: string | undefined) => void;
}

// 節目を、3つの時間帯ボタンから選ぶ。もう一度押すと解除する。
export function BandRow({ label, value, bands, onChange }: BandRowProps) {
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
              onClick={() => onChange(on ? undefined : b.id)}
              className={`flex-1 rounded-xl border py-2.5 text-sm font-bold focus:ring-2 focus:ring-[var(--accent)] ${
                on
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
              }`}
            >
              {b.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
