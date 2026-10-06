// 記録フォームの「理由」選択肢を、使用頻度の高い順に並べる。
//
// 頻度は保存済みの記録(reasonTags)から都度数えるので、専用のテーブルや列は持たない。
// 「＋追加」で足したタグも記録に残る限り翌日以降の選択肢に出て、そのタグを使った記録が
// 無くなれば(0回になれば)選択肢から消える。初期セットは0回でも常に出す。
import type { Outcome } from "@/constants/choices";

interface ReasonSource {
  outcome?: Outcome | null;
  reasonTags: string[];
}

// 「よかった理由」(smooth)と「気になる理由」(それ以外)は選択肢が別なので、数える対象も分ける。
// 結果が未入力の記録はどちらにも数えない。
export function isPositiveOutcome(outcome: Outcome | null | undefined): boolean | null {
  if (!outcome) return null;
  return outcome === "smooth";
}

export function countReasonUsage(records: ReasonSource[], positive: boolean): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of records) {
    if (isPositiveOutcome(r.outcome) !== positive) continue;
    // 1件の記録内で同じタグが重複していても1回と数える。
    for (const tag of new Set(r.reasonTags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}

// 並び: 使用回数の多い順。同数なら「初期セットの定義順 → 記録に現れた追加タグ(使用回数順に
// 続けて、同数なら初めて現れた順)→ 今のフォームだけにある未保存のタグ」。
export function rankReasonOptions(
  base: readonly string[],
  counts: Map<string, number>,
  extra: readonly string[]
): string[] {
  const baseSet = new Set(base);
  const fromHistory = Array.from(counts.keys()).filter((t) => !baseSet.has(t));
  const unsaved = extra.filter((t) => !baseSet.has(t) && !counts.has(t));
  const ordered = Array.from(new Set([...base, ...fromHistory, ...unsaved]));
  return ordered
    .map((tag, index) => ({ tag, index, count: counts.get(tag) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map((x) => x.tag);
}
