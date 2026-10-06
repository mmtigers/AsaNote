import type { MilestoneKey } from "@/constants/choices";
import { parseTimeToMinutes } from "@note/core/date";

const CANDIDATE_COUNT = 3;

function toHm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * 節目の時刻の候補ボタン(3つ)を決める。
 *
 * 過去の記録で**よく選んだ時刻の上位3つ**を使い、足りない分は初期の候補で埋める。
 * 同数のときは初期の候補を優先し、最後に時刻順に並べる(ボタンの位置が使うたびに入れ替わると
 * 押し間違えやすいため、表示は常に時刻の昇順にする)。
 * 履歴に使われた時刻でも、初期候補にも履歴にも無い時刻を勝手に増やすことはしない。
 */
export function rankTimeCandidates(defaults: readonly string[], history: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const t of history) counts.set(t, (counts.get(t) ?? 0) + 1);

  const defaultOrder = new Map(defaults.map((t, i) => [t, i]));
  const pool = Array.from(new Set([...defaults, ...counts.keys()]));
  const picked = pool
    .map((t) => ({ t, count: counts.get(t) ?? 0, base: defaultOrder.get(t) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => b.count - a.count || a.base - b.base || a.t.localeCompare(b.t))
    .slice(0, CANDIDATE_COUNT)
    .map((x) => x.t);

  return picked.sort((a, b) => (parseTimeToMinutes(a) ?? 0) - (parseTimeToMinutes(b) ?? 0));
}

/** 「ほか」の選択メニュー用。from〜to を step 分刻みで並べる(両端を含む)。 */
export function timeMenuOptions(from: string, to: string, step: number): string[] {
  const start = parseTimeToMinutes(from);
  const end = parseTimeToMinutes(to);
  if (start === null || end === null || step <= 0) return [];
  const out: string[] = [];
  for (let m = start; m <= end; m += step) out.push(toHm(m));
  return out;
}

/** 記録の一覧から、ある節目の時刻だけを取り出す(未入力は除く)。 */
export function collectMilestoneHistory(
  records: readonly { times: Partial<Record<MilestoneKey, string | null>> }[],
  key: MilestoneKey
): string[] {
  const out: string[] = [];
  for (const r of records) {
    const v = r.times[key];
    if (v) out.push(v);
  }
  return out;
}
