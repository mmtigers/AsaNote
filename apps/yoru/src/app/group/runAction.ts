import { describeErrorForUser } from "@/lib/errors";

export type ActionResult<T> = { ok: true; value: T } | { ok: false };

// try/catchの定型反復(失敗時にconsole.errorへ記録し、ユーザー向けメッセージを
// onErrorへ渡す)をまとめたヘルパー。戻り値のokで、呼び出し側が後続処理を
// 続けるか中断するかを判断できる(例: グループ作成に失敗したら以降の招待コード
// 発行をスキップする、など)。
export async function runAction<T>(
  fn: () => Promise<T>,
  fallbackMessage: string,
  onError: (message: string) => void
): Promise<ActionResult<T>> {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (error) {
    console.error(error);
    onError(describeErrorForUser(error, fallbackMessage));
    return { ok: false };
  }
}

// ユーザーへの通知が不要な、ベストエフォートな処理用(失敗してもログに残すのみ)。
// 例: グループ作成直後のメンバー一覧再取得のように、失敗しても致命的ではない
// 後続処理。
export async function runSilently(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error(error);
  }
}
