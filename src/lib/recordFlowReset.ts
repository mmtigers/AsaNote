"use client";

import { useEffect } from "react";

// 記録フローの途中(result / reason)で BottomNav の「記録する」を押したとき、最初の画面
// (home)まで戻すための通知。
//
// 既にホーム(`/`)にいる状態で同じ `/` へのリンクを押しても Next.js は画面を作り直さず、
// 記録フローのステップ状態がそのまま残ってしまう。BottomNav は layout 側、ステップ状態は
// page 側(useStepNavigation)にあり共通の親コンポーネントが無いため、同一タブ内の window
// イベントで伝える(draft.ts が localStorage の変更を同一タブへ通知しているのと同じ考え方)。
const RECORD_FLOW_RESET_EVENT = "asa-note:record-flow-reset";

export function requestRecordFlowReset(): void {
  window.dispatchEvent(new Event(RECORD_FLOW_RESET_EVENT));
}

// onReset は呼び出し側で useCallback しておくこと(毎レンダー変わると購読し直しになる)。
export function useRecordFlowResetListener(onReset: () => void): void {
  useEffect(() => {
    window.addEventListener(RECORD_FLOW_RESET_EVENT, onReset);
    return () => window.removeEventListener(RECORD_FLOW_RESET_EVENT, onReset);
  }, [onReset]);
}
