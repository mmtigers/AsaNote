// 子どもを複数にする前に記録した分は childId が null(未分類)のまま残る。
// 「記録済みか」を見る画面(ホームのカレンダー・リマインド等)で、それらを取りこぼさないための判定。
// 選択中の子どもがいる(複数登録)ときは、その子どもの記録に加えて未分類の記録も対象にする。
// 子どもが未選択(null)のときは、これまで通り未分類の記録だけが対象。
export function isForChildOrUnassigned(recordChildId: string | null | undefined, childId: string | null): boolean {
  const rc = recordChildId ?? null;
  return rc === childId || (childId !== null && rc === null);
}

// 同じ日に、選択中の子どもの記録と未分類の記録の両方があるときは、子どもの記録を優先する。
export function pickDayStatuses<T extends { recordDate: string; childId?: string | null; updatedAt: string; outcome: V }, V>(
  rows: T[],
  childId: string | null
): Map<string, V> {
  const relevant = rows
    .filter((r) => isForChildOrUnassigned(r.childId, childId))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const exact = new Map<string, V>();
  const unassigned = new Map<string, V>();
  for (const r of relevant) ((r.childId ?? null) === childId ? exact : unassigned).set(r.recordDate, r.outcome);
  return new Map([...unassigned, ...exact]);
}

// 同じ日・同じ子どもの記録が複数あるとき、編集・表示の対象にする1件を選ぶ。
// 選択中の子どもの記録を優先し、無ければ未分類の記録。同順位は更新が新しいもの。
export function pickLatestForChild<T extends { childId?: string | null; updatedAt: string }>(
  rows: T[],
  childId: string | null
): T | undefined {
  return rows
    .filter((r) => isForChildOrUnassigned(r.childId, childId))
    .sort((a, b) => {
      const ea = (a.childId ?? null) === childId ? 1 : 0;
      const eb = (b.childId ?? null) === childId ? 1 : 0;
      return eb - ea || b.updatedAt.localeCompare(a.updatedAt);
    })[0];
}
