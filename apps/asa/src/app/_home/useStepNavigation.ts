"use client";

import { useCallback, useEffect, useState } from "react";
import type { Step } from "./types";

// 各ステップがホームから何回分の画面遷移(=ブラウザ履歴のpushState)を経ているか。
// スマホのバックボタンでホームまで一気に戻したいときに history.go(-depth) で使う。
const STEP_DEPTH: Record<Step, number> = { home: 0, form: 1 };

export interface StepTransition {
  direction: "forward" | "backward";
  seq: number;
}

// 記録フローのステップ(home→form)と、それに連動するブラウザ履歴・画面遷移
// アニメーションをまとめて管理する。ステップ遷移をhistory.pushStateに積んでおくことで、
// スマホ/ブラウザの戻るボタンでアプリごと閉じてしまわず一つ前のステップに戻れるようにする。
export function useStepNavigation() {
  const [step, setStep] = useState<Step>("home");
  // ステップ間の画面遷移アニメーション用。次の項目へ進むときは右から、
  // 前のステップへ戻るときは左からスライドインさせる。seqは同じステップへ
  // 戻ってきたときでもアニメーションを再生させるためのキー。
  const [stepTransition, setStepTransition] = useState<StepTransition>({
    direction: "forward",
    seq: 0,
  });

  // 初回マウント時に現在の履歴エントリを「home」として登録しておく(以降の
  // goToStep("forward")呼び出しで、この上にformを積んでいく)。
  useEffect(() => {
    window.history.replaceState({ ...(window.history.state ?? {}), appStep: "home" }, "");
  }, []);

  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      const state = e.state as { appStep?: Step } | null;
      const nextStep: Step = state?.appStep ?? "home";
      setStepTransition((t) => ({ direction: "backward", seq: t.seq + 1 }));
      setStep(nextStep);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // draft復元・編集リンクからの自動遷移など、ユーザー操作を介さずにステップを進める場合も、
  // 上と同じ理由でその分の履歴エントリを積んでおく。
  const pushHistoryToStep = useCallback((target: Step) => {
    if (target === "form") {
      window.history.pushState({ appStep: "form" }, "");
    }
  }, []);

  const goToStep = useCallback((next: Step, direction: "forward" | "backward") => {
    setStepTransition((t) => ({ direction, seq: t.seq + 1 }));
    setStep(next);
    if (direction === "forward") {
      window.history.pushState({ appStep: next }, "");
    }
  }, []);

  // draft復元・編集リンク経由の自動遷移用。アニメーションは再生させず、対象ステップ
  // までの履歴だけを積んで直接そのステップを表示する。
  const restoreStep = useCallback(
    (target: Step) => {
      pushHistoryToStep(target);
      setStep(target);
    },
    [pushHistoryToStep]
  );

  const goBack = useCallback(() => {
    // ブラウザ履歴を1つ戻す。実際のステップの切り替えはpopstateハンドラが行うことで、
    // このボタンとスマホ/ブラウザの戻るボタンの挙動を一致させる。
    window.history.back();
  }, []);

  // 積んであるステップ分の履歴をまとめて戻す(popstateハンドラがhomeへの遷移を処理する)。
  // 履歴が積まれていない(home)場合はpopstateが発火しないため、直接homeへ遷移する。
  const goHome = useCallback(() => {
    const depth = STEP_DEPTH[step];
    if (depth > 0) window.history.go(-depth);
    else goToStep("home", "backward");
  }, [step, goToStep]);

  return { step, stepTransition, goToStep, restoreStep, goBack, goHome };
}
