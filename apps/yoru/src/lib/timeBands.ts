import { MILESTONES, type BandId, type BandMilestone, type BandMilestoneKey, type MilestoneKey } from "@/constants/choices";
import { parseTimeToMinutes } from "@note/core/date";

type BandDef = BandMilestone["bands"][number];

const BAND_MILESTONES: readonly BandMilestone[] = MILESTONES.filter((m): m is BandMilestone => "bands" in m);

export function isBandMilestone(key: MilestoneKey): key is BandMilestoneKey {
  return BAND_MILESTONES.some((m) => m.key === key);
}

export function bandsOf(key: BandMilestoneKey): readonly BandDef[] {
  return BAND_MILESTONES.find((m) => m.key === key)?.bands ?? [];
}

/**
 * 保存された値を帯のidに揃える。帯のid(early / mid / late)はそのまま、「ほか」で選んだ "HH:MM" は
 * その時刻が属する帯へ寄せる(傾向の集計用)。どちらでもない値は null。
 */
export function toBandId(key: BandMilestoneKey, value: string | null | undefined): BandId | null {
  if (!value) return null;
  const bands = bandsOf(key);
  const direct = bands.find((b) => b.id === value);
  if (direct) return direct.id;
  const minutes = parseTimeToMinutes(value);
  if (minutes === null) return null;
  return bands.find((b) => minutes < b.to)?.id ?? null;
}

/** 日記文用: 帯なら「20〜21時」、時刻なら「20:30ごろ」。読めない値は null。 */
export function milestoneWhen(key: BandMilestoneKey, value: string | null | undefined): string | null {
  if (!value) return null;
  const band = bandsOf(key).find((b) => b.id === value);
  if (band) return band.label;
  return parseTimeToMinutes(value) === null ? null : `${value}ごろ`;
}

/** 一覧・CSV用に整える。帯の節目は、帯なら帯の名前、時刻ならそのまま。夕食は時刻のまま。 */
export function milestoneDisplay(key: MilestoneKey, value: string | null | undefined): string {
  if (!value) return "";
  if (!isBandMilestone(key)) return value;
  return bandsOf(key).find((b) => b.id === value)?.label ?? (parseTimeToMinutes(value) === null ? "" : value);
}

/**
 * 保存・同期の前後で値を検める。帯のidと、読める "HH:MM" はそのまま通し、それ以外は捨てる
 * (旧い版が書いた壊れた値を、帯の節目に持ち込まないため)。夕食など時刻の節目は素通し。
 */
export function normalizeMilestoneValue(key: MilestoneKey, value: string | null | undefined): string | null {
  if (!value) return null;
  if (!isBandMilestone(key)) return value;
  return toBandId(key, value) ? value : null;
}
