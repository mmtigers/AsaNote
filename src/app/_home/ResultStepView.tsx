"use client";

import { OUTCOME_OPTIONS, type Outcome } from "@/constants/choices";

const OUTCOME_STYLES: Record<Outcome, string> = {
  smooth: "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]",
  reluctant: "border-[var(--amber)] bg-[var(--amber-soft)] text-[var(--amber)]",
  absent: "border-[var(--calm)] bg-[var(--calm-soft)] text-[var(--calm)]",
};

interface ResultStepViewProps {
  isTodaySelected: boolean;
  // 既にこの日の記録があるときの、現在選択中の結果(#1-1: 過去記録を開き直した
  // ときにどれを選んでいたか一目で分かるようにするため)。未選択ならnull。
  currentOutcome: Outcome | null;
  onSelectOutcome: (outcome: Outcome) => void;
}

export function ResultStepView({ isTodaySelected, currentOutcome, onSelectOutcome }: ResultStepViewProps) {
  return (
    <>
      <h2 className="text-[15px] font-bold">{isTodaySelected ? "今日はどうだった？" : "この日はどうだった？"}</h2>
      <div className="flex flex-col gap-3">
        {OUTCOME_OPTIONS.map((opt) => {
          const isSelected = opt.value === currentOutcome;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelectOutcome(opt.value)}
              aria-pressed={isSelected}
              className={`relative flex items-center gap-4 rounded-3xl border-2 px-5 py-5 text-left shadow-sm active:scale-[0.98] ${OUTCOME_STYLES[opt.value]} ${
                isSelected ? "ring-2 ring-offset-2 ring-[var(--accent)]" : ""
              }`}
            >
              <span className="text-4xl">{opt.emoji}</span>
              <span className="text-base font-bold">{opt.label}</span>
              {isSelected && (
                <span
                  aria-hidden="true"
                  className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-bold text-[var(--accent-ink)]"
                >
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
