"use client";

import { resolveEffectiveChildId as resolveCoreChildId, useChildren } from "@note/core/db/children";
import type { Child } from "@note/core/types/group";
import { useSelectedChildId } from "./selectedChild";

// 子どもの取得・作成・更新・削除と一覧フックの実装は @note/core/db/children。ここから再エクスポートする。
export * from "@note/core/db/children";
// 上の再エクスポートの同名関数は、下で定義するこのアプリ用の版が優先される。

// 記録フォーム(ホーム画面)で「今どの子どもを記録対象にしているか」を返す。
// 「選択中の子ども」はアプリごとの端末内の値(selectedChild.ts)なので、アプリ側に置く。
export function useEffectiveChildId(): string | null {
  const children = useChildren();
  const selectedId = useSelectedChildId();
  return resolveEffectiveChildId(children, selectedId);
}

// 記録の対象にする子どもID。子どもが1人だけのときも、その子として記録・表示する
// (core の同名関数は0〜1人で null を返し、1人のときに割り当て済みの記録が見えなくなるため)。
// 0人・一覧が未取得のときは null(未分類)。2人以上は、選択中の子ども(未選択なら先頭)。
export function resolveEffectiveChildId(children: Child[] | null, selectedId: string | null): string | null {
  if (children && children.length === 1) return children[0]!.id;
  return resolveCoreChildId(children, selectedId);
}
