// ブラウザのPush API周りの薄いラッパー(#3-2)。VAPID公開鍵の変換や購読の
// 取得・解除など、テストしにくいブラウザAPI呼び出しをここに集約し、
// 呼び出し側(useNotificationSettings)をモックしやすくする。

// PushManager.subscribe()のapplicationServerKeyはUint8Arrayを要求するが、
// VAPID公開鍵はURL-safe base64文字列で配布されるため変換が要る。
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

function toSubscriptionKeys(subscription: PushSubscription): PushSubscriptionKeys | null {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) return null;
  return { endpoint: json.endpoint, p256dh, auth };
}

// 通知の許可を求め、許可されればPush購読を作成する。拒否・非対応時はnull。
export async function requestPushSubscription(vapidPublicKey: string): Promise<PushSubscriptionKeys | null> {
  if (!isPushSupported()) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    }));

  return toSubscriptionKeys(subscription);
}

// この端末の既存の購読を解除する(あれば)。呼び出し元がサーバー側の行も
// 削除する必要がある(このファイルはブラウザ側の状態のみを扱う)。
export async function unsubscribeCurrentDevice(): Promise<string | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return null;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  return endpoint;
}
