// 傾向ページ(#2)の集計ロジック。画面から切り離した純関数として置き、テストで固定する
// (件数の数え間違いは画面がエラーにならず静かに嘘をつくため)。
import { type BandMilestoneKey, type MilestoneKey, type Outcome, type ResponseEffect } from "@/constants/choices";
import { bandsOf, toBandId } from "@/lib/timeBands";

// 集計に必要なフィールドだけを要求する(テストで最小のオブジェクトを渡せるようにするため)。
export interface AggregatableRecord {
  recordDate: string; // "YYYY-MM-DD"
  updatedAt: string;
  outcome: Outcome | null;
  times: Partial<Record<MilestoneKey, string | null>>;
  friend: string[];
  trigger: string[];
  response: string[];
  responseEffect: ResponseEffect | null;
}

// カレンダー表示用: 日付 -> その日の結果。
// 同じ日に複数件ある(子どもが複数・パートナーも記録した)場合は最終更新が新しい方を採用する。
// ホーム画面のカレンダー(useRecordStatusForMonth)と同じ畳み方に揃えてある。
export function outcomeByDate(records: AggregatableRecord[]): Map<string, Outcome> {
  const latest = new Map<string, { outcome: Outcome; updatedAt: string }>();
  for (const r of records) {
    if (!r.outcome) continue;
    const current = latest.get(r.recordDate);
    if (!current || r.updatedAt.localeCompare(current.updatedAt) > 0) {
      latest.set(r.recordDate, { outcome: r.outcome, updatedAt: r.updatedAt });
    }
  }
  return new Map(Array.from(latest, ([date, v]) => [date, v.outcome]));
}

export type OutcomeCounts = Record<Outcome, number>;

function emptyCounts(): OutcomeCounts {
  return { calm: 0, rough: 0, storm: 0 };
}

// 様子の内訳。様子を選んで保存した記録だけが対象。
export function countOutcomes(records: AggregatableRecord[]): { total: number; counts: OutcomeCounts } {
  const counts = emptyCounts();
  for (const r of records) if (r.outcome) counts[r.outcome] += 1;
  return { total: counts.calm + counts.rough + counts.storm, counts };
}

// 荒れた(少し荒れた+大荒れ)割合(百分率・四捨五入)。
export function roughRate(counts: OutcomeCounts): number {
  const total = counts.calm + counts.rough + counts.storm;
  return total === 0 ? 0 : Math.round(((counts.rough + counts.storm) / total) * 100);
}

// 傾向タブの項目をタップしたときの詳細表示(#3-3)で、その項目に数えられた記録を取り出す。
// 数え方は下の集計関数と同じ条件にそろえてある(件数と一覧がずれると静かに嘘をつくため)。
// 返す順は新しい日付から。
function newestFirst<T extends AggregatableRecord>(records: T[]): T[] {
  return [...records].sort((a, b) => b.recordDate.localeCompare(a.recordDate) || b.updatedAt.localeCompare(a.updatedAt));
}

export function recordsForOutcome<T extends AggregatableRecord>(records: T[], outcome: Outcome): T[] {
  return newestFirst(records.filter((r) => r.outcome === outcome));
}

function recordsForBand<T extends AggregatableRecord>(records: T[], key: BandMilestoneKey, bandId: string): T[] {
  return newestFirst(records.filter((r) => !!r.outcome && toBandId(key, r.times[key]) === bandId));
}

export function recordsForBedtime<T extends AggregatableRecord>(records: T[], bucketKey: string): T[] {
  return recordsForBand(records, "bed", bucketKey);
}

export function recordsForHomeworkStart<T extends AggregatableRecord>(records: T[], bucketKey: string): T[] {
  return recordsForBand(records, "hwStart", bucketKey);
}

export function recordsForFriendPromise<T extends AggregatableRecord>(records: T[], bucketKey: "with" | "without" | string): T[] {
  return newestFirst(
    records.filter((r) => {
      if (!r.outcome) return false;
      if (r.friend.includes("約束あり")) return bucketKey === "with";
      if (r.friend.includes("約束なし")) return bucketKey === "without";
      return false;
    })
  );
}

export function recordsForTag<T extends AggregatableRecord>(records: T[], pick: (r: T) => string[], tag: string): T[] {
  return newestFirst(records.filter((r) => pick(r).includes(tag)));
}

export function recordsForResponseTag<T extends AggregatableRecord>(records: T[], tag: string): T[] {
  return newestFirst(records.filter((r) => !!r.responseEffect && r.response.includes(tag)));
}

export interface OutcomeBucket {
  key: string;
  label: string;
  total: number;
  counts: OutcomeCounts;
  roughRate: number;
}

function toBucket(key: string, label: string, counts: OutcomeCounts): OutcomeBucket {
  return { key, label, total: counts.calm + counts.rough + counts.storm, counts, roughRate: roughRate(counts) };
}

// ある節目(時間帯で選ぶもの)× 様子。節目と様子の両方がある記録だけが対象で、記録の無い帯は省く。
function outcomeByBand(records: AggregatableRecord[], key: BandMilestoneKey): OutcomeBucket[] {
  const bands = bandsOf(key);
  const counts = new Map<string, OutcomeCounts>(bands.map((b) => [b.id, emptyCounts()]));
  for (const r of records) {
    if (!r.outcome) continue;
    const id = toBandId(key, r.times[key]);
    const c = id && counts.get(id);
    if (c) c[r.outcome] += 1;
  }
  return bands.map((b) => toBucket(b.id, b.label, counts.get(b.id) ?? emptyCounts())).filter((b) => b.total > 0);
}

// 宿題開始の時間帯 × 様子。
export function outcomeByHomeworkStart(records: AggregatableRecord[]): OutcomeBucket[] {
  return outcomeByBand(records, "hwStart");
}

// 消灯の時間帯 × 様子。
export function outcomeByBedtime(records: AggregatableRecord[]): OutcomeBucket[] {
  return outcomeByBand(records, "bed");
}

// 友達との約束の有無 × 様子。「約束あり」「約束なし」のタグが付いた記録だけが対象。
// 両方付いている記録は「約束あり」を優先する(約束があった日として見るほうが振り返りに役立つため)。
export function outcomeByFriendPromise(records: AggregatableRecord[]): OutcomeBucket[] {
  const withPromise = emptyCounts();
  const without = emptyCounts();
  for (const r of records) {
    if (!r.outcome) continue;
    if (r.friend.includes("約束あり")) withPromise[r.outcome] += 1;
    else if (r.friend.includes("約束なし")) without[r.outcome] += 1;
  }
  return [toBucket("with", "約束あり", withPromise), toBucket("without", "約束なし", without)].filter(
    (b) => b.total > 0
  );
}

export interface TagCount {
  tag: string;
  count: number;
}

// きっかけ・対応などのタグを使われた回数の多い順に数える(同数は名前順で安定させる)。
export function countTags(records: AggregatableRecord[], pick: (r: AggregatableRecord) => string[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const r of records) for (const tag of new Set(pick(r))) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return Array.from(counts, ([tag, count]) => ({ tag, count })).sort(
    (a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "ja")
  );
}

export interface ResponseEffectStat {
  tag: string;
  total: number; // 効き具合を入力した記録のうち、この対応を含むもの
  effects: Record<ResponseEffect, number>;
}

// 対応タグごとの「効いた/少し/効かず」の件数。効き具合は記録単位(1件につき1つ)なので、
// その記録に付いた対応タグすべてに同じ評価を数える。効き具合が未入力の記録は対象外。
export function responseEffectStats(records: AggregatableRecord[]): ResponseEffectStat[] {
  const byTag = new Map<string, Record<ResponseEffect, number>>();
  for (const r of records) {
    if (!r.responseEffect) continue;
    for (const tag of new Set(r.response)) {
      const effects = byTag.get(tag) ?? { good: 0, mid: 0, bad: 0 };
      effects[r.responseEffect] += 1;
      byTag.set(tag, effects);
    }
  }
  return Array.from(byTag, ([tag, effects]) => ({
    tag,
    total: effects.good + effects.mid + effects.bad,
    effects,
  })).sort((a, b) => b.total - a.total || a.tag.localeCompare(b.tag, "ja"));
}

// 分数を "HH:MM" に戻す。
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
