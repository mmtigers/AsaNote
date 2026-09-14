"use client";

import { useEffect } from "react";
import { clearDraft, saveDraft } from "./draftStorage";
import type { FormState, Step } from "./types";

interface Options {
  loaded: boolean;
  date: string;
  step: Step;
  detailOpen: boolean;
  form: FormState;
}

// 結果選択・理由入力ステップにいる間は、入力内容を下書きとして保存し続ける。
// ホームに戻ったとき(保存完了後を含む)は不要になるので下書きを消す。
// 「保存完了→goHome()でstepがhomeになる」という遷移も、このホーム到達時の
// クリア処理に自然に乗る形になっており、保存フロー側で個別に下書きを
// 消す処理を持つ必要はない。
export function useDraftPersistence({ loaded, date, step, detailOpen, form }: Options) {
  useEffect(() => {
    if (!loaded) return;
    if (step === "home") {
      clearDraft();
      return;
    }
    saveDraft({ date, step, detailOpen, form });
  }, [loaded, step, detailOpen, form, date]);
}
