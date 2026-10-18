import { addDaysToDate, todayJst } from "@/lib/jst";

// 記録の状況の判定と集計(SPEC §6)。画面から切り離した純粋な関数(テストしやすくするため)。
//   - 日の状態は「完了」「途中まで(記録はあるが未完了)」「未記録」の3つ。完了は本人が「完了」を押した日で、
//     一部の項目が未入力でも完了として数える(SPEC §4.2)。
//   - 未記録の日は「記録が無い」だけで、体調不良・服薬忘れとは判定しない(お薬を飲んでいない日に数えない)。

export type DayState = "completed" | "partial" | "none";

export const DAY_STATE_LABELS: Record<DayState, string> = {
  completed: "✓ 完了",
  partial: "途中まで",
  none: "未記録",
};

export function dayState(record: { completedAt: string | null } | undefined): DayState {
  if (!record) return "none";
  return record.completedAt ? "completed" : "partial";
}

export type PeriodKind = "week" | "month";

export interface Period {
  kind: PeriodKind;
  /** 今の期間からいくつ前か(0 = 今の期間)。 */
  offset: number;
  from: string;
  /** 期間の最後の日。今日より後にはしない(未来の日は数えない)。 */
  to: string;
  label: string;
}

/**
 * 集計の期間。週は「今日までの7日間」を0として7日ずつさかのぼる(直近7日の確認と、週ごとの集計を兼ねる)。
 * 月は暦の月(今月は今日まで)。
 */
export function periodOf(kind: PeriodKind, offset: number, today: string = todayJst()): Period {
  if (kind === "week") {
    const to = addDaysToDate(today, -7 * offset);
    const from = addDaysToDate(to, -6);
    return { kind, offset, from, to, label: offset === 0 ? "この1週間" : `${shortDate(from)}〜${shortDate(to)}` };
  }
  const [y, m] = today.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1 - offset, 1));
  const from = first.toISOString().slice(0, 10);
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const label = `${first.getUTCFullYear()}年${first.getUTCMonth() + 1}月`;
  return { kind, offset, from, to: last < today ? last : today, label: offset === 0 ? `今月(${label})` : label };
}

function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
}

/** from〜to の日付(新しい順)。 */
export function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = to; date >= from; date = addDaysToDate(date, -1)) dates.push(date);
  return dates;
}

export interface PeriodSummary {
  completed: number;
  partial: number;
  none: number;
  medicationNotTaken: number;
}

/**
 * 期間のうち、表示・集計する日(新しい順)。countFrom(家族に参加した日)より前の日は、記録が無ければ除く
 * (参加する前の日を「未記録」として数えないため。参加の前の日をあとから記録した場合は含める)。
 */
export function datesToShow(from: string, to: string, recorded: { has(date: string): boolean }, countFrom?: string): string[] {
  return datesBetween(from, to).filter((date) => !countFrom || date >= countFrom || recorded.has(date));
}

/** 期間の集計。お薬を飲んでいない日は、記録で「飲んでいない」を選んだ日だけ(未記録・未入力・わからないは数えない)。 */
export function summarize(
  dates: string[],
  records: ReadonlyMap<string, { completedAt: string | null; medication: string | null }>
): PeriodSummary {
  const summary: PeriodSummary = { completed: 0, partial: 0, none: 0, medicationNotTaken: 0 };
  for (const date of dates) {
    const record = records.get(date);
    summary[dayState(record)] += 1;
    if (record?.medication === "not_taken") summary.medicationNotTaken += 1;
  }
  return summary;
}
