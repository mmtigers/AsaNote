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
 * 保存された値を帯のidに揃える。新しい記録は帯のid(early / mid / late)そのもの、帯を導入する前の
 * 記録は "HH:MM" なので、その時刻が属する帯へ寄せる。どちらでもない値は null。
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

/** 表示用の帯の名前(「20〜21時」など)。帯にできない値は null。 */
export function bandLabel(key: BandMilestoneKey, value: string | null | undefined): string | null {
  const id = toBandId(key, value);
  return bandsOf(key).find((b) => b.id === id)?.label ?? null;
}

/** 記録に入っている節目の値を表示用に整える。帯の節目は帯の名前、夕食は時刻のまま。 */
export function milestoneDisplay(key: MilestoneKey, value: string | null | undefined): string {
  if (!value) return "";
  return isBandMilestone(key) ? (bandLabel(key, value) ?? "") : value;
}

/**
 * 保存・同期の直前に、帯の節目の値を帯のidへ揃える(帯を導入する前の "HH:MM" が残っていても
 * クラウドへはidで書く)。夕食など時刻の節目はそのまま。
 */
export function normalizeMilestoneValue(key: MilestoneKey, value: string | null | undefined): string | null {
  if (!value) return null;
  return isBandMilestone(key) ? toBandId(key, value) : value;
}
