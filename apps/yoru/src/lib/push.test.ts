import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { restorePushSubscription, urlBase64ToUint8Array } from "./push";

describe("urlBase64ToUint8Array", () => {
  it("URL-safe base64(パディングなし)をバイト列に変換する", () => {
    // "hello?>" のbase64は "aGVsbG8/Pg=="。URL-safeでは "/" が "_"、末尾の "=" は省かれる。
    const bytes = urlBase64ToUint8Array("aGVsbG8_Pg");
    expect(Array.from(bytes)).toEqual(Array.from(new TextEncoder().encode("hello?>")));
  });
});

describe("restorePushSubscription(#174)", () => {
  const KEYS_JSON = { endpoint: "https://push/1", keys: { p256dh: "k", auth: "a" } };
  const subscribe = vi.fn();
  const getSubscription = vi.fn();

  function stubBrowser(permission: NotificationPermission) {
    vi.stubGlobal("Notification", { permission, requestPermission: vi.fn() });
    vi.stubGlobal("PushManager", class {});
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager: { getSubscription, subscribe } }) },
    });
  }

  beforeEach(() => {
    subscribe.mockReset().mockResolvedValue({ toJSON: () => KEYS_JSON });
    getSubscription.mockReset().mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("許可済みで購読が無ければ、許可を求めずに購読を作ってキーを返す", async () => {
    stubBrowser("granted");
    const keys = await restorePushSubscription("aGVsbG8");
    expect(keys).toEqual({ endpoint: "https://push/1", p256dh: "k", auth: "a" });
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(Notification.requestPermission).not.toHaveBeenCalled();
  });

  it("すでにこの端末に購読があれば、何もしない(購読を増やさない)", async () => {
    stubBrowser("granted");
    getSubscription.mockResolvedValue({ toJSON: () => KEYS_JSON });
    expect(await restorePushSubscription("aGVsbG8")).toBeNull();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it.each(["default", "denied"] as const)("許可が%sなら、確認も出さず何もしない", async (permission) => {
    stubBrowser(permission);
    expect(await restorePushSubscription("aGVsbG8")).toBeNull();
    expect(Notification.requestPermission).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("Push非対応のブラウザでは何もしない", async () => {
    expect(await restorePushSubscription("aGVsbG8")).toBeNull();
    expect(subscribe).not.toHaveBeenCalled();
  });
});
