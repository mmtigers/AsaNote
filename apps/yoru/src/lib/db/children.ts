"use client";

import { resolveEffectiveChildId, useChildren } from "@note/core/db/children";
import { useSelectedChildId } from "./selectedChild";

// 子どもの取得・作成・更新・削除と一覧フックの実装は @note/core/db/children。ここから再エクスポートする。
export * from "@note/core/db/children";

// 記録フォーム(ホーム画面)で「今どの子どもを記録対象にしているか」を返す。
// 「選択中の子ども」はアプリごとの端末内の値(selectedChild.ts)なので、アプリ側に置く。
export function useEffectiveChildId(): string | null {
  const children = useChildren();
  const selectedId = useSelectedChildId();
  return resolveEffectiveChildId(children, selectedId);
}
