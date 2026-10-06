// あさノート連携(SPEC §5)の集計。夜の記録と「その翌朝」のあさノートの記録を、日付と子どもで
// 論理結合して見る。画面から切り離した純関数として置き、テストで固定する。
import { addDays, parseTimeToMinutes } from "@/lib/date";
import type { Outcome } from "@/constants/choices";
import type { MorningOutcome, MorningRecord } from "@/lib/db/morning";
import type { AggregatableRecord } from "./aggregate";

export interface NightMorningPair {
  night: AggregatableRecord;
  morning: MorningRecord;
}

// 夜(日付D)と翌朝(D+1)・同じ子ども(どちらも未設定を含む)を組にする。同じ日・子どもに朝の記録が
// 複数あれば最終更新が新しい方を使う。翌朝の記録が無い夜は組にならない。
export function pairNightWithNextMorning(
  nights: (AggregatableRecord & { childId?: string | null })[],
  mornings: MorningRecord[]
): NightMorningPair[] {
  const latest = new Map<string, MorningRecord>();
  for (const m of mornings) {
    const key = `${m.recordDate}|${m.childId ?? ""}`;
    const cur = latest.get(key);
    if (!cur || m.updatedAt.localeCompare(cur.updatedAt) > 0) latest.set(key, m);
  }
  const pairs: NightMorningPair[] = [];
  for (const night of nights) {
    const morning = latest.get(`${addDays(night.recordDate, 1)}|${night.childId ?? ""}`);
    if (morning) pairs.push({ night, morning });
  }
  return pairs;
}

export type MorningCounts = Record<MorningOutcome, number>;

export interface MorningBucket {
  key: string;
  label: string;
  total: number; // 翌朝の結果(outcome)がある組の数
  counts: MorningCounts;
  strugglingRate: number; // 行き渋った+行かなかった の割合(百分率・四捨五入)
  averageWakeMinutes: number | null;
  wakeCount: number;
}

function toBucket(key: string, label: string, pairs: NightMorningPair[]): MorningBucket {
  const counts: MorningCounts = { smooth: 0, reluctant: 0, absent: 0 };
  const wakes: number[] = [];
  for (const { morning } of pairs) {
    if (morning.outcome) counts[morning.outcome] += 1;
    const m = morning.wakeTime ? parseTimeToMinutes(morning.wakeTime) : null;
    if (m !== null) wakes.push(m);
  }
  const total = counts.smooth + counts.reluctant + counts.absent;
  return {
    key,
    label,
    total,
    counts,
    strugglingRate: total === 0 ? 0 : Math.round(((counts.reluctant + counts.absent) / total) * 100),
    averageWakeMinutes: wakes.length ? Math.round(wakes.reduce((a, b) => a + b, 0) / wakes.length) : null,
    wakeCount: wakes.length,
  };
}

// 消灯時刻の区分(分)。境界は MILESTONES.bed の候補(20:00/20:30/21:00)に合わせた。
const BED_BUCKETS = [
  { key: "early", label: "〜20:29", from: 0, to: 20 * 60 + 30 },
  { key: "mid", label: "20:30台", from: 20 * 60 + 30, to: 21 * 60 },
  { key: "late", label: "21:00台", from: 21 * 60, to: 21 * 60 + 30 },
  { key: "later", label: "21:30〜", from: 21 * 60 + 30, to: 48 * 60 },
] as const;

// 消灯時刻 × 翌朝。消灯時刻がある夜だけが対象で、組が無い区分は省く。
export function morningByBedtime(pairs: NightMorningPair[]): MorningBucket[] {
  const grouped = new Map<string, NightMorningPair[]>();
  for (const p of pairs) {
    const minutes = p.night.times.bed ? parseTimeToMinutes(p.night.times.bed) : null;
    if (minutes === null) continue;
    const bucket = BED_BUCKETS.find((b) => minutes >= b.from && minutes < b.to);
    if (!bucket) continue;
    grouped.set(bucket.key, [...(grouped.get(bucket.key) ?? []), p]);
  }
  return BED_BUCKETS.flatMap((b) => {
    const list = grouped.get(b.key);
    return list ? [toBucket(b.key, b.label, list)] : [];
  });
}

// 夜の様子 × 翌朝。夜の様子がある夜だけが対象。
export function morningByNightOutcome(
  pairs: NightMorningPair[],
  options: readonly { value: Outcome; label: string }[]
): MorningBucket[] {
  return options.flatMap((o) => {
    const list = pairs.filter((p) => p.night.outcome === o.value);
    return list.length ? [toBucket(o.value, o.label, list)] : [];
  });
}
