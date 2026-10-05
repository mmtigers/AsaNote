// 記録フォームのタグ選択肢を、使用頻度の高い順に並べる(あさノートの reasonOptions と同じ方式)。
//
// 頻度は保存済みの記録から都度数えるので、専用のテーブルや列は持たない。
// 「＋追加」で足したタグも記録に残る限り翌日以降の選択肢に出て、そのタグを使った記録が
// 無くなれば(0回になれば)選択肢から消える。初期セットは0回でも常に出す。

export function countTagUsage<T>(records: readonly T[], getTags: (record: T) => readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of records) {
    // 1件の記録内で同じタグが重複していても1回と数える。
    for (const tag of new Set(getTags(r))) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}

// 並び: 使用回数の多い順。同数なら「初期セットの定義順 → 記録に現れた追加タグ(初めて現れた順)
// → 今のフォームだけにある未保存のタグ」。
export function rankTagOptions(
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
