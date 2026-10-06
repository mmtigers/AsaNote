// ブラウザのfetch自体が失敗した場合(オフライン・DNS解決失敗・CORS等)に投げられる
// エラーメッセージ。ブラウザ実装ごとに文言が異なるため代表的なものを列挙して判定する。
const NETWORK_ERROR_MESSAGES = [
  "failed to fetch", // Chrome/Edge
  "networkerror when attempting to fetch resource", // Firefox
  "load failed", // Safari
];

export function describeErrorDetail(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return null;
}

export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const message = describeErrorDetail(error)?.toLowerCase();
  if (!message) return false;
  return NETWORK_ERROR_MESSAGES.some((needle) => message.includes(needle));
}

export const NETWORK_ERROR_MESSAGE_JA =
  "通信エラーが発生しました。ネットワーク接続をご確認のうえ、もう一度お試しください。";

export function describeErrorForUser(error: unknown, fallback: string): string {
  if (isNetworkError(error)) return NETWORK_ERROR_MESSAGE_JA;
  const detail = describeErrorDetail(error);
  return detail ? `${fallback}(${detail})` : fallback;
}
