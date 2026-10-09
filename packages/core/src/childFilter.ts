// タイムライン・傾向の「子どもで絞り込む」選択の値(#127)。
// null は「すべて」、子どものidはその子、UNASSIGNED_FILTER は子ども未分類(childId が無い)の記録だけ。
// 子どものidは UUID なので、この値と衝突しない。
export const UNASSIGNED_FILTER = "__unassigned__";

export function matchesChildFilter(childId: string | null | undefined, filter: string | null): boolean {
  if (filter === null) return true;
  if (filter === UNASSIGNED_FILTER) return !childId;
  return childId === filter;
}
