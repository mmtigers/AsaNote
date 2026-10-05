"use client";

import { AuthStatus } from "@/components/AuthStatus";
import { ChildSwitcher } from "@/components/ChildSwitcher";
import { MonthCalendar } from "@/components/MonthCalendar";
import { OUTCOME_OPTIONS, type Outcome } from "@/constants/choices";
import { formatDateLabel, toMonthOf } from "@/lib/date";
import type { LocalRecord } from "@/lib/db/localDb";
import { useRecordPhotos } from "@/lib/db/photos";
import { buildRecordPreview } from "@/lib/recordPreview";
import type { Child } from "@/types/models";

interface HomeStepViewProps {
  today: string;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  viewMonth: { year: number; month: number };
  onMonthChange: (year: number, month: number) => void;
  statusByDate: Map<string, Outcome | null> | undefined;
  childList: Child[];
  childId: string | null;
  onSelectChild: (id: string | null) => void;
  ownRecord: LocalRecord | null | undefined;
  onStart: () => void;
}

function RecordSummary({ record, onEdit }: { record: LocalRecord; onEdit: () => void }) {
  const photos = useRecordPhotos(record.id);
  const outcome = OUTCOME_OPTIONS.find((o) => o.value === record.outcome);
  const preview = buildRecordPreview({ ...record, photoCount: photos?.length ?? 0 });

  return (
    <button
      type="button"
      onClick={onEdit}
      className="w-full rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 text-left focus:ring-2 focus:ring-[var(--accent)]"
    >
      <p className="text-base font-bold">
        {outcome?.emoji} {outcome?.label}
      </p>
      {preview && <p className="mt-1 line-clamp-3 text-[13px] text-[var(--sub)]">{preview}</p>}
      <p className="mt-2 text-xs font-semibold text-[var(--accent)]">✏️ 記録を編集する</p>
    </button>
  );
}

export function HomeStepView({
  today,
  selectedDate,
  onSelectDate,
  viewMonth,
  onMonthChange,
  statusByDate,
  childList,
  childId,
  onSelectChild,
  ownRecord,
  onStart,
}: HomeStepViewProps) {
  const isToday = selectedDate === today;
  const hasRecord = !!ownRecord?.outcome;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6">
      <header className="flex items-start justify-between gap-3">
        <h1 className="text-lg font-bold">🌙 {formatDateLabel(selectedDate)}のきろく</h1>
        <AuthStatus />
      </header>

      {childList.length >= 2 && <ChildSwitcher childList={childList} selectedId={childId} onSelect={onSelectChild} />}

      <MonthCalendar
        year={viewMonth.year}
        month={viewMonth.month}
        todayValue={today}
        statusByDate={statusByDate}
        onMonthChange={onMonthChange}
        selectedDate={selectedDate}
        onSelectDate={(date) => {
          onSelectDate(date);
          const { year, month } = toMonthOf(date);
          if (year !== viewMonth.year || month !== viewMonth.month) onMonthChange(year, month);
        }}
      />

      {ownRecord && hasRecord ? (
        <RecordSummary record={ownRecord} onEdit={onStart} />
      ) : (
        <button
          type="button"
          onClick={onStart}
          className="rounded-full bg-[var(--accent)] py-4 text-[15px] font-bold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent)]"
        >
          🌙 {isToday ? "今夜の様子を記録する" : "この日の様子を記録する"}
        </button>
      )}
    </main>
  );
}
