const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDateLabel(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})`;
}

export function toMonthOf(value: string): { year: number; month: number } {
  const d = new Date(`${value}T00:00:00`);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function addDays(value: string, delta: number): string {
  const d = new Date(`${value}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return toDateInputValue(d);
}
