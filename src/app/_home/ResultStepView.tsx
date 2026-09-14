"use client";

import { OUTCOME_OPTIONS, type Outcome } from "@/constants/choices";

const OUTCOME_STYLES: Record<Outcome, string> = {
  smooth: "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]",
  reluctant: "border-[var(--amber)] bg-[var(--amber-soft)] text-[var(--amber)]",
  absent: "border-[var(--calm)] bg-[var(--calm-soft)] text-[var(--calm)]",
};

interface ResultStepViewProps {
  isTodaySelected: boolean;
  onSelectOutcome: (outcome: Outcome) => void;
}

export function ResultStepView({ isTodaySelected, onSelectOutcome }: ResultStepViewProps) {
  return (
    <>
      <h2 className="text-[15px] font-bold">{isTodaySelected ? "今日はどうだった？" : "この日はどうだった？"}</h2>
      <div className="flex flex-col gap-3">
        {OUTCOME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSelectOutcome(opt.value)}
            className={`flex items-center gap-4 rounded-3xl border-2 px-5 py-5 text-left shadow-sm active:scale-[0.98] ${OUTCOME_STYLES[opt.value]}`}
          >
            <span className="text-4xl">{opt.emoji}</span>
            <span className="text-base font-bold">{opt.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}
