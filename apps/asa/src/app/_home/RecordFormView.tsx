"use client";

import type { ChangeEvent } from "react";
import { TagChips } from "@/components/TagChips";
import { MEMO_MAX_LENGTH, type Outcome } from "@/constants/choices";
import { DepartTimePicker } from "./DepartTimePicker";
import { ResultStepView } from "./ResultStepView";
import { WakeTimePicker } from "./WakeTimePicker";

interface RecordFormViewProps {
  isTodaySelected: boolean;
  outcome: Outcome | null;
  onSelectOutcome: (outcome: Outcome) => void;
  reasonOptions: string[];
  reasonTags: string[];
  onReasonTagsChange: (next: string[]) => void;
  onAddCustomReasonTag: (tag: string) => void;
  wakeTime: string;
  onWakeTimeChange: (value: string) => void;
  departTime: string;
  onDepartTimeChange: (value: string) => void;
  memo: string;
  onMemoChange: (value: string) => void;
  preview: string;
  loaded: boolean;
  saveError: string | null;
  onSave: () => void;
}

export function RecordFormView({
  isTodaySelected,
  outcome,
  onSelectOutcome,
  reasonOptions,
  reasonTags,
  onReasonTagsChange,
  onAddCustomReasonTag,
  wakeTime,
  onWakeTimeChange,
  departTime,
  onDepartTimeChange,
  memo,
  onMemoChange,
  preview,
  loaded,
  saveError,
  onSave,
}: RecordFormViewProps) {
  return (
    <>
      {/* 「この日はどうだった？」は専用画面をやめ、朝起きた時間のすぐ上に置いて1ページで入力を完結させる。 */}
      <ResultStepView isTodaySelected={isTodaySelected} currentOutcome={outcome} onSelectOutcome={onSelectOutcome} />

      <WakeTimePicker value={wakeTime} onChange={onWakeTimeChange} />

      {/* 出発時刻は以前メモ欄側の折りたたみの中にあり気づかれず、キーボード入力も要った。
          選択式にして理由の前(画面上部)へ出している。 */}
      <DepartTimePicker value={departTime} onChange={onDepartTimeChange} />

      {/* 理由の選択肢は結果によって変わるため、結果が選ばれるまで理由欄は出さない。 */}
      {outcome && (
        <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
          <h2 className="mb-3 text-[15px] font-bold">
            {outcome === "smooth" ? "😊 よかった理由は？" : "😣 気になる理由は？"}
          </h2>
          <TagChips
            options={reasonOptions}
            value={reasonTags}
            onChange={onReasonTagsChange}
            onAddCustom={onAddCustomReasonTag}
          />
        </section>
      )}

      {/* タグの「＋追加」は短い言葉を足す場所。長い文章を書く場所と混同されたため、
          メモ欄は常時表示の別カード(アクセント色の枠)にして役割の違いを見せている。 */}
      <section className="flex flex-col gap-1 rounded-3xl border-2 border-[var(--accent)] bg-[var(--surface)] p-4 shadow-sm">
        <label className="mb-2 text-[15px] font-bold" htmlFor="memo">
          📝 メモ欄
        </label>
        <textarea
          id="memo"
          value={memo}
          maxLength={MEMO_MAX_LENGTH}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onMemoChange(e.target.value)}
          placeholder="気づいたこと、次に試したいことなど"
          rows={6}
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-sm leading-relaxed outline-none"
        />
        <p className="mt-1 text-right text-[11px] text-[var(--sub)]" aria-live="polite">
          {memo.length} / {MEMO_MAX_LENGTH}
        </p>
      </section>

      <section className="rounded-3xl border border-dashed border-[var(--line)] bg-[var(--surface-2)] p-4">
        <span className="mb-1.5 block text-[11px] uppercase tracking-wide text-[var(--sub)]">記録プレビュー</span>
        <p className="text-[14.5px] leading-[1.85]">{preview}</p>
      </section>

      {!outcome && (
        <p className="text-center text-[12px] text-[var(--sub)]">「{isTodaySelected ? "今日" : "この日"}はどうだった？」を選ぶと保存できます</p>
      )}
      {saveError && (
        <p role="alert" className="text-center text-[13px] font-semibold text-[var(--accent)]">
          {saveError}
        </p>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={!loaded || !outcome}
        className="sticky bottom-4 z-20 mt-1 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] py-3.5 text-base font-bold text-[var(--accent-ink)] shadow-lg disabled:opacity-60"
      >
        ✓ この日の記録を保存する
      </button>
    </>
  );
}
