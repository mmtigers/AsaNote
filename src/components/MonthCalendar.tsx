"use client";

import type { Outcome } from "@/constants/choices";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const STATUS_DOT_STYLES: Record<Outcome, string> = {
  smooth: "bg-[var(--accent)]",
  reluctant: "bg-[var(--amber)]",
  absent: "bg-[var(--calm)]",
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

interface MonthCalendarProps {
  year: number;
  month: number; // 1-12
  selectedDate: string; // YYYY-MM-DD、記録の入力対象日
  todayValue: string; // YYYY-MM-DD
  statusByDate: Map<string, Outcome | null> | undefined;
  onSelectDate: (date: string) => void;
  onMonthChange: (year: number, month: number) => void;
}

export function MonthCalendar({
  year,
  month,
  selectedDate,
  todayValue,
  statusByDate,
  onSelectDate,
  onMonthChange,
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
              onClick={() => onSelectDate(todayValue)}
              className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--sub)]"
            >
              今日
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
          return (
            <button
              key={value}
              type="button"
              onClick={() => onSelectDate(value)}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              className={`mx-auto flex h-9 w-9 flex-col items-center justify-center gap-0.5 rounded-full text-[13px] ${
                isSelected
                  ? "bg-[var(--accent)] font-bold text-[var(--accent-ink)]"
                  : isToday
                    ? "border border-[var(--accent)] text-[var(--ink)]"
                    : "text-[var(--ink)]"
              }`}
            >
              <span>{day}</span>
              <span
                className={`h-1 w-1 rounded-full ${status ? STATUS_DOT_STYLES[status] : ""} ${
                  isSelected && status ? "ring-1 ring-[var(--accent-ink)]" : ""
                }`}
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
