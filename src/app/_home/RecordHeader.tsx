"use client";

import { AuthStatus } from "@/components/AuthStatus";
import type { Step } from "./types";

interface RecordHeaderProps {
  step: Step;
  dateLabel: string;
  onBack: () => void;
}

export function RecordHeader({ step, dateLabel, onBack }: RecordHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--bg)]/95 px-4 pt-5 pb-3 backdrop-blur-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h1 className="whitespace-nowrap text-xl font-bold">🌸 あさノート</h1>
        <AuthStatus />
      </div>

      {step === "home" ? (
        <p className="mt-3 text-[15px] font-bold">{dateLabel}のきろく</p>
      ) : (
        <div className="mt-3 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[13px] font-medium text-[var(--sub)]"
          >
            ← もどる
          </button>
          <p className="text-[15px] font-bold">{dateLabel}のきろく</p>
        </div>
      )}
    </header>
  );
}
