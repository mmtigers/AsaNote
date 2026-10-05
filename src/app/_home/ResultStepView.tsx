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
    <section>
      <h2 className="mb-3 text-[15px] font-bold">{isTodaySelected ? "今日はどうだった？" : "この日はどうだった？"}</h2>
      {/* 「朝起きた時間は？」の選択肢と同じ大きさ(丸いチップ)にそろえる。 */}
      <div className="flex gap-2">
        {OUTCOME_OPTIONS.map((opt) => {
          const isSelected = opt.value === currentOutcome;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelectOutcome(opt.value)}
              aria-pressed={isSelected}
              className={`flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-2 py-2 text-[13px] font-medium active:scale-[0.98] ${OUTCOME_STYLES[opt.value]} ${
                isSelected ? "ring-2 ring-offset-1 ring-[var(--accent)]" : ""
              }`}
            >
              <span>{opt.emoji}</span>
              <span>{opt.shortLabel}</span>
              {isSelected && <span aria-hidden="true">✓</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
