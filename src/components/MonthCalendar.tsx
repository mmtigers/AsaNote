"use client";

import type { Outcome } from "@/constants/choices";
import { OUTCOME_COLOR_STYLES, OUTCOME_SOFT_STYLES } from "@/constants/outcomeStyles";
import { WEEKDAYS, toMonthOf } from "@/lib/date";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

interface MonthCalendarProps {
  year: number;
  month: number; // 1-12
  todayValue: string; // YYYY-MM-DD
  statusByDate: Map<string, Outcome | null> | undefined;
  onMonthChange: (year: number, month: number) => void;
  // 以下2つはホーム画面の記録フロー(日付を選ぶ用途)でのみ渡す。
  // 省略すると読み取り専用のカレンダーになり、日セルはボタンにならない(#4の傾向タブ)。
  selectedDate?: string; // YYYY-MM-DD、記録の入力対象日
  onSelectDate?: (date: string) => void;
}

export function MonthCalendar({
  year,
  month,
  todayValue,
  statusByDate,
  onMonthChange,
  selectedDate,
  onSelectDate,
}: MonthCalendarProps) {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function goPrevMonth() {
    if (month === 1) onMonthChange(year - 1, 12);
    else onMonthChange(year, month - 1);
  }
  function goNextMonth() {
    if (month === 12) onMonthChange(year + 1, 1);
    else onMonthChange(year, month + 1);
  }

  // 日付を選べるカレンダーでは今日を選び直し、読み取り専用では今月の表示へ戻す。
  function goToday() {
    if (onSelectDate) {
      onSelectDate(todayValue);
      return;
    }
    const { year: y, month: m } = toMonthOf(todayValue);
    onMonthChange(y, m);
  }

  const isDisplayingCurrentMonth = `${year}-${pad2(month)}` === todayValue.slice(0, 7);

  return (
    <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={goPrevMonth}
          aria-label="前の月"
          className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--sub)]"
        >
          ◀
        </button>
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-bold">
            {year}年{month}月
          </p>
          {!isDisplayingCurrentMonth && (
            <button
              type="button"
              onClick={goToday}
              className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--sub)]"
            >
              {onSelectDate ? "今日" : "今月"}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={goNextMonth}
          aria-label="次の月"
          className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--sub)]"
        >
          ▶
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-[11px] text-[var(--sub)]">
            {w}
          </span>
        ))}
        {cells.map((day, idx) => {
          if (day === null) return <span key={`blank-${idx}`} />;
          const value = `${year}-${pad2(month)}-${pad2(day)}`;
          const isSelected = value === selectedDate;
          const isToday = value === todayValue;
          const status = statusByDate?.get(value);
          const cellClassName = `mx-auto flex h-9 w-9 flex-col items-center justify-center gap-0.5 rounded-full text-[13px] ${
            isSelected
              ? "bg-[var(--accent)] font-bold text-[var(--accent-ink)]"
              : isToday
                ? `border border-[var(--accent)] text-[var(--ink)] ${status ? OUTCOME_SOFT_STYLES[status] : ""}`
                : `text-[var(--ink)] ${status ? OUTCOME_SOFT_STYLES[status] : ""}`
          }`;
          const dot = (
            <span
              className={`h-1 w-1 rounded-full ${status ? OUTCOME_COLOR_STYLES[status] : ""} ${
                isSelected && status ? "ring-1 ring-[var(--accent-ink)]" : ""
              }`}
            />
          );

          // 読み取り専用(傾向タブ)ではタップしても何も起きないため、ボタンにはしない。
          if (!onSelectDate) {
            return (
              <span key={value} className={cellClassName} aria-current={isToday ? "date" : undefined}>
                <span>{day}</span>
                {dot}
              </span>
            );
          }

          return (
            <button
              key={value}
              type="button"
              onClick={() => onSelectDate(value)}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              className={cellClassName}
            >
              <span>{day}</span>
              {dot}
            </button>
          );
        })}
      </div>
    </section>
  );
}
