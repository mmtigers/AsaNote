"use client";

import { useCallback, useEffect, useRef } from "react";
import { createIdleMeter } from "@/lib/idleMeter";

// 画面への操作とみなすイベント。input はキー入力・貼り付け・IME のどれでも発火する。
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "input", "touchstart", "scroll"] as const;

// active の間(記録フォームを開いている間)だけ、操作の間隔から放置の時間を測る。
// 戻り値は「ここまでの放置の秒数」を返す関数(保存時に record_saved へ付ける)。
export function useIdleMeter(active: boolean): () => number {
  const meterRef = useRef(createIdleMeter());

  useEffect(() => {
    const meter = meterRef.current;
    if (!active) {
      meter.stop();
      return;
    }
    meter.start(Date.now());
    const onActivity = () => meter.touch(Date.now());
    // scroll は中のスクロール領域のものも拾うため capture で受ける。
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { capture: true, passive: true });
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity, { capture: true });
      meter.stop();
    };
  }, [active]);

  return useCallback(() => meterRef.current.idleSeconds(Date.now()), []);
}
