import type { PeriodKind } from "@/lib/recordStats";

// 家族向けの閲覧で、選んでいた親・期間を覚えておく(日の記録を開いて戻ったときに、元の画面に戻すため)。
// タブを閉じれば消えてよい表示の都合なので sessionStorage に置く。読めない環境(プライベートブラウズ等)でも動くようにする。
const KEY = "oya-note:family-view";

export interface FamilyViewState {
  parentId: string | null;
  kind: PeriodKind;
  offset: number;
}

const DEFAULT_STATE: FamilyViewState = { parentId: null, kind: "week", offset: 0 };

export function loadFamilyViewState(): FamilyViewState {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return DEFAULT_STATE;
    const value = JSON.parse(raw) as Partial<FamilyViewState>;
    return {
      parentId: typeof value.parentId === "string" ? value.parentId : null,
      kind: value.kind === "month" ? "month" : "week",
      offset: Number.isInteger(value.offset) && (value.offset as number) >= 0 ? (value.offset as number) : 0,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveFamilyViewState(state: FamilyViewState): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // 保存できなくても、閲覧はできる。
  }
}
