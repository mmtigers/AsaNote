// 記録フォームを開いてから保存までのうち、「手が止まっていた時間」(放置)を測る。
// 所要時間(started→saved)は、フォームを開いたまま放置すると数十分〜数日になり、「サッと記録できたか」
// の指標にならないため、放置の分を record_saved の idle_seconds として送り、集計で差し引けるようにする。
//
// 操作(タップ・キー入力・スクロール)の間隔が threshold を超えたら、超えた分だけを放置とみなす
// (threshold までは「考えている時間」として所要時間に残す)。最後の操作から今までの間も同じ。
// 時刻は呼び出し側が渡す(テストしやすくするため。Date.now() に依存しない)。
export const IDLE_THRESHOLD_MS = 60_000;

export interface IdleMeter {
  // 計測を始める(フォームを開いた時刻)。前の計測は捨てる。
  start(nowMs: number): void;
  // 操作があった。
  touch(nowMs: number): void;
  // ここまでの放置の合計(秒、四捨五入)。計測中でなければ 0。
  idleSeconds(nowMs: number): number;
  // 計測をやめる(フォームを閉じた)。
  stop(): void;
}

export function createIdleMeter(thresholdMs: number = IDLE_THRESHOLD_MS): IdleMeter {
  let lastActivityMs: number | null = null;
  let idleMs = 0;

  // 端末の時計が戻った場合などの負の間隔は、0 として扱う。
  function excess(nowMs: number, sinceMs: number): number {
    return Math.max(0, nowMs - sinceMs - thresholdMs);
  }

  return {
    start(nowMs) {
      lastActivityMs = nowMs;
      idleMs = 0;
    },
    touch(nowMs) {
      if (lastActivityMs === null) return;
      idleMs += excess(nowMs, lastActivityMs);
      lastActivityMs = Math.max(lastActivityMs, nowMs);
    },
    idleSeconds(nowMs) {
      if (lastActivityMs === null) return 0;
      return Math.round((idleMs + excess(nowMs, lastActivityMs)) / 1000);
    },
    stop() {
      lastActivityMs = null;
      idleMs = 0;
    },
  };
}
