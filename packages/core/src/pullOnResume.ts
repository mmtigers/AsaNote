// アプリが前面に戻ったとき(バックグラウンドからの復帰)に、一定間隔を空けて、クラウドから取り込む(#125)。
// パートナーの新規記録は、PWAを起動したままだと次の起動まで見えないため。Realtime は使わない。
//
// クラウドからの取り込み(pullFromCloud)の中身はアプリごとに違うので、関数として受け取る。
// ここが持つのは「前回の取り込み時刻(メモリ上のみ)」「間隔の判定」「同時実行の防止」「リスナーの登録」だけ。

/** 前面に戻ったとき、前回の取り込みからこれ以上空いていれば取り込む。 */
export const RESUME_PULL_INTERVAL_MS = 5 * 60 * 1000;

export interface ResumePuller {
  /** 取り込みを始めたことを記録する。起動時・ログイン時・グループ参加後などの既存の取り込みからも呼ぶ(直後の二重取り込みを避ける)。 */
  markPulled(): void;
  /** 前面に戻ったときの判定と取り込み。取り込んだら true。失敗してもエラーは投げず、ログに残すだけ。 */
  pullIfStale(): Promise<boolean>;
  /** `visibilitychange` のリスナーを張る。重複して張らない。戻り値で解除する。 */
  register(): () => void;
}

export interface ResumePullerOptions {
  /** そのアプリの取り込み。 */
  pull: () => Promise<unknown>;
  /** ログイン済みか(ローカルのセッションを見る。通信はしない)。 */
  isSignedIn: () => Promise<boolean>;
  intervalMs?: number;
}

export function createResumePuller({
  pull,
  isSignedIn,
  intervalMs = RESUME_PULL_INTERVAL_MS,
}: ResumePullerOptions): ResumePuller {
  // localStorage には残さない。アプリを起動し直せば、起動時の取り込みが走るため。
  let lastPulledAt: number | null = null;
  let running = false;
  let unregister: (() => void) | null = null;

  function markPulled() {
    lastPulledAt = Date.now();
  }

  async function pullIfStale(): Promise<boolean> {
    if (running) return false;
    if (typeof navigator !== "undefined" && !navigator.onLine) return false;
    if (lastPulledAt !== null && Date.now() - lastPulledAt < intervalMs) return false;

    running = true;
    try {
      if (!(await isSignedIn())) return false;
      // 完了後ではなく開始時に記録する(失敗が続いても、前面に戻るたびに全件を取り直さないため)。
      markPulled();
      await pull();
      return true;
    } catch (error) {
      // ユーザー操作ではないので、エラー表示は出さない。
      console.warn("復帰時の取り込みに失敗しました:", error);
      return false;
    } finally {
      running = false;
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === "visible") void pullIfStale();
  }

  function register() {
    if (typeof document === "undefined") return () => {};
    if (unregister) return unregister;
    document.addEventListener("visibilitychange", onVisibilityChange);
    const off = () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (unregister === off) unregister = null;
    };
    unregister = off;
    return off;
  }

  return { markPulled, pullIfStale, register };
}
