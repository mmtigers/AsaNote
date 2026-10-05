// マジックリンク(OTP)の再送クールダウンを localStorage に持つ。
//
// ページを再読み込みしてもクールダウンが効くように、送信時刻を残して判定する。
// プライベートブラウジングやサイトデータのブロック時は localStorage 自体が throw するため、
// 読み書きの両方を try/catch で保護する(src/lib/db/selectedChild.ts と同じ方針)。

export const COOLDOWN_SECONDS = 30;

const LAST_SENT_KEY = "yoru-note:lastOtpSentAt";

/**
 * 残りクールダウン秒数。0 なら送信できる。
 *
 * localStorage が読めない環境では 0（クールダウン無し）にフォールバックする。
 * 連打の抑止は Supabase 側のレート制限もあるため、ここが効かないことより
 * ログイン画面がマウント時に落ちることの方が問題が大きい。
 */
export function getRemainingCooldown(now: number = Date.now()): number {
  let lastSent = 0;
  try {
    lastSent = Number(window.localStorage.getItem(LAST_SENT_KEY) ?? 0);
  } catch {
    return 0;
  }
  if (!Number.isFinite(lastSent)) return 0;
  const elapsedSeconds = (now - lastSent) / 1000;
  return Math.max(0, Math.ceil(COOLDOWN_SECONDS - elapsedSeconds));
}

/**
 * 送信時刻を記録する。
 *
 * **失敗しても throw しない。** 呼び出し元では `signInWithOtp()` と同じ `try` の中で
 * 呼ばれるため、ここで throw するとメールは送信できているのに
 * 「ログインリンクの送信に失敗しました」と誤表示され、送信完了の案内も出なくなる。
 * 保存できなくてもクールダウンはその画面の state では効く(再読み込みで消えるだけ)。
 */
export function rememberSentAt(now: number = Date.now()): void {
  try {
    window.localStorage.setItem(LAST_SENT_KEY, String(now));
  } catch {
    // 保存できない環境では諦める(送信自体は成功している)
  }
}
