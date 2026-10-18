import {
  ACTIVITY_CHOICES,
  ACTIVITY_KEYS,
  ACTIVITY_LABELS,
  choiceLabel,
  CONDITION_CHOICES,
  MEAL_CHOICES,
  MEAL_KEYS,
  MEAL_LABELS,
  MEDICATION_CHOICES,
} from "@/constants/choices";
import type { DailyRecord } from "@/lib/db/records";

/** 1日の記録の中身(読むだけ。家族向けの閲覧)。未入力は「未入力」と出し、選んだ値と区別する。 */
export function RecordDetails({ record }: { record: DailyRecord }) {
  const rows: [string, string][] = [
    ...MEAL_KEYS.map((key): [string, string] => [MEAL_LABELS[key], choiceLabel(MEAL_CHOICES, record[key])]),
    ["お薬", choiceLabel(MEDICATION_CHOICES, record.medication)],
    ...ACTIVITY_KEYS.map((key): [string, string] => [ACTIVITY_LABELS[key], choiceLabel(ACTIVITY_CHOICES, record[key])]),
    ["体調", choiceLabel(CONDITION_CHOICES, record.condition)],
  ];
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-[var(--surface)] p-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-lg">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-[var(--sub)]">{label}</dt>
            <dd className={value === "未入力" ? "text-[var(--sub)]" : "font-bold"}>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-1">
        <p className="text-base text-[var(--sub)]">メモ</p>
        <p className="text-lg whitespace-pre-wrap">{record.memo || <span className="text-[var(--sub)]">なし</span>}</p>
      </div>
    </section>
  );
}

/** 一覧の1行に出す短い要約(お薬と体調)。 */
export function recordSummary(record: Pick<DailyRecord, "medication" | "condition">): string {
  return `お薬: ${choiceLabel(MEDICATION_CHOICES, record.medication)}・体調: ${choiceLabel(CONDITION_CHOICES, record.condition)}`;
}
