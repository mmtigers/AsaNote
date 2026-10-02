"use client";

import type { PointerEvent } from "react";
import type { Outcome } from "@/constants/choices";

interface OutcomeSummary {
  value: Outcome;
  label: string;
  emoji: string;
}

interface HomeStepViewProps {
  loaded: boolean;
  selectedOutcome: OutcomeSummary | undefined;
  reasonTags: string[];
  isTodaySelected: boolean;
  onPointerDown: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onRecordClick: (action: () => void) => void;
  onEditRecord: () => void;
  onStartRecording: () => void;
}

// homeステップの記録ボタン部分。まだ記録が無ければ「記録する」入り口、
// 既にあれば結果の要約カード(+編集導線)を出す。左右スワイプでの日付切り替えは
// 呼び出し側から渡されるポインタイベントハンドラで処理する。
export function HomeStepView({
  loaded,
  selectedOutcome,
  reasonTags,
  isTodaySelected,
  onPointerDown,
  onPointerUp,
  onRecordClick,
  onEditRecord,
  onStartRecording,
}: HomeStepViewProps) {
  if (!loaded) {
    return <div className="h-40 animate-pulse rounded-3xl bg-[var(--surface-2)]" />;
  }

  return (
    <div onPointerDown={onPointerDown} onPointerUp={onPointerUp} className="touch-pan-y">
      {selectedOutcome ? (
        <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{selectedOutcome.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{selectedOutcome.label}</p>
              {reasonTags.length > 0 && (
                <p className="mt-0.5 truncate text-[12px] text-[var(--sub)]">理由: {reasonTags.join("・")}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRecordClick(onEditRecord)}
            className="mt-4 w-full rounded-full border border-[var(--line)] bg-[var(--surface-2)] py-2.5 text-sm font-semibold text-[var(--ink)]"
          >
            ✏️ 記録を編集する
          </button>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => onRecordClick(onStartRecording)}
          className="flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-[var(--accent)] bg-[var(--accent-soft)] px-6 py-10 text-center shadow-sm active:scale-[0.98]"
        >
          <span className="text-5xl">📝</span>
          <span className="text-base font-bold text-[var(--accent)]">
            {isTodaySelected ? "今日の様子を記録する" : "この日の様子を記録する"}
          </span>
        </button>
      )}
    </div>
  );
}
