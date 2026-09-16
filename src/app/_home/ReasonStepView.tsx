"use client";

import type { ChangeEvent } from "react";
import { TagChips } from "@/components/TagChips";
import { MEMO_MAX_LENGTH, type Outcome } from "@/constants/choices";

interface ReasonStepViewProps {
  outcome: Outcome;
  reasonOptions: string[];
  reasonTags: string[];
  onReasonTagsChange: (next: string[]) => void;
  onAddCustomReasonTag: (tag: string) => void;
  detailOpen: boolean;
  onToggleDetail: () => void;
  departTime: string;
  onDepartTimeChange: (value: string) => void;
  memo: string;
  onMemoChange: (value: string) => void;
  preview: string;
  loaded: boolean;
  onSave: () => void;
}

export function ReasonStepView({
  outcome,
  reasonOptions,
  reasonTags,
  onReasonTagsChange,
  onAddCustomReasonTag,
  detailOpen,
  onToggleDetail,
  departTime,
  onDepartTimeChange,
  memo,
  onMemoChange,
  preview,
  loaded,
  onSave,
}: ReasonStepViewProps) {
  return (
    <>
      <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
        <h2 className="mb-1 text-[15px] font-bold">
          {outcome === "smooth" ? "😊 よかった理由は？" : "😣 気になる理由は？"}
        </h2>
        <p className="mb-3 text-[12px] text-[var(--sub)]">思い当たるものを選んでね。無ければ書き足してもOK</p>
        <TagChips
          options={reasonOptions}
          value={reasonTags}
          onChange={onReasonTagsChange}
          onAddCustom={onAddCustomReasonTag}
        />
      </section>

      <button
        type="button"
        onClick={onToggleDetail}
        className="flex items-center justify-center gap-1.5 rounded-full border border-dashed border-[var(--line)] py-2 text-[12px] text-[var(--sub)]"
      >
        詳細を追加(任意) {detailOpen ? "▲" : "▼"}
      </button>

      {detailOpen && (
        <section className="step-enter-right rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2.5">
            <label className="w-16 flex-none text-xs text-[var(--sub)]" htmlFor="departTime">
              出発時刻
            </label>
            <input
              id="departTime"
              type="time"
              autoComplete="off"
              value={departTime}
              onChange={(e: ChangeEvent<HTMLInputElement>) => onDepartTimeChange(e.target.value)}
              className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1.5 text-base font-medium tabular-nums"
            />
          </div>
          <label className="mb-1.5 block text-xs text-[var(--sub)]" htmlFor="memo">
            振り返りメモ
          </label>
          <textarea
            id="memo"
            value={memo}
            maxLength={MEMO_MAX_LENGTH}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onMemoChange(e.target.value)}
            placeholder="気づいたこと、次に試したいことなど"
            className="min-h-16 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-sm leading-relaxed outline-none"
          />
          <p className="mt-1 text-right text-[11px] text-[var(--sub)]" aria-live="polite">
            {memo.length} / {MEMO_MAX_LENGTH}
          </p>
        </section>
      )}

      <section className="rounded-3xl border border-dashed border-[var(--line)] bg-[var(--surface-2)] p-4">
        <span className="mb-1.5 block text-[11px] uppercase tracking-wide text-[var(--sub)]">記録プレビュー</span>
        <p className="text-[14.5px] leading-[1.85]">{preview}</p>
      </section>

      <button
        type="button"
        onClick={onSave}
        disabled={!loaded}
        className="sticky bottom-4 z-20 mt-1 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] py-3.5 text-base font-bold text-[var(--accent-ink)] shadow-lg disabled:opacity-60"
      >
        ✓ この日の記録を保存する
      </button>
    </>
  );
}
