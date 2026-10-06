import { afterEach, describe, expect, it, vi } from "vitest";
import { COOLDOWN_SECONDS, getRemainingCooldown, rememberSentAt } from "./otpCooldown";

const LAST_SENT_KEY = "yoru-note:lastOtpSentAt";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("getRemainingCooldown", () => {
  it("未送信ならクールダウン無し", () => {
    expect(getRemainingCooldown()).toBe(0);
  });

  it("送信直後はクールダウン秒数を返す", () => {
    const now = 1_000_000;
    window.localStorage.setItem(LAST_SENT_KEY, String(now));
    expect(getRemainingCooldown(now)).toBe(COOLDOWN_SECONDS);
  });

  it("経過した分だけ減る", () => {
    const now = 1_000_000;
    window.localStorage.setItem(LAST_SENT_KEY, String(now));
    expect(getRemainingCooldown(now + 10_000)).toBe(COOLDOWN_SECONDS - 10);
  });

  it("クールダウン経過後は0", () => {
    const now = 1_000_000;
    window.localStorage.setItem(LAST_SENT_KEY, String(now));
    expect(getRemainingCooldown(now + (COOLDOWN_SECONDS + 5) * 1000)).toBe(0);
  });

  it("保存値が数値でなければクールダウン無しとして扱う", () => {
    window.localStorage.setItem(LAST_SENT_KEY, "こわれた値");
    expect(getRemainingCooldown()).toBe(0);
  });

  // #62 の回帰テスト。以前は try/catch が無く、localStorage が throw する環境
  // (プライベートブラウジング、サイトデータのブロック)ではログイン画面が
  // マウント時に落ちていた。
  it("localStorage が読めない環境でも throw せず0を返す", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(() => getRemainingCooldown()).not.toThrow();
    expect(getRemainingCooldown()).toBe(0);
  });
});

describe("rememberSentAt", () => {
  it("送信時刻を保存し、次回の判定に効く", () => {
    const now = 2_000_000;
    rememberSentAt(now);
    expect(getRemainingCooldown(now)).toBe(COOLDOWN_SECONDS);
  });

  // #62 の回帰テスト。以前は signInWithOtp() と同じ try の中で setItem を直接
  // 呼んでいたため、書き込みが throw するとメールは送信できているのに
  // 「ログインリンクの送信に失敗しました」と誤表示され、送信完了の案内も出なかった。
  it("localStorage へ書き込めない環境でも throw しない", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(() => rememberSentAt()).not.toThrow();
  });
});
