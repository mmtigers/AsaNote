import { afterEach, describe, expect, it, vi } from "vitest";
import {
  displayNameFromEmail,
  isAuthorizedCall,
  isStaleSubscriptionError,
  jstDateNow,
  jstTimeNow,
  partnerRecordPayload,
  reminderPayload,
  selectReminderTargets,
  sendToSubscriptions,
  type PushSubscriptionRow,
} from "./pushLogic";

describe("jstTimeNow / jstDateNow", () => {
  it("UTCをJSTのHH:MMへ変換する(UTC12:00 → JST21:00)", () => {
    expect(jstTimeNow(new Date("2026-10-05T12:00:30Z"))).toBe("21:00");
  });

  it("日付をまたぐ場合はJSTの翌日になる(UTC15:30 → JST翌00:30)", () => {
    const now = new Date("2026-10-05T15:30:00Z");
    expect(jstTimeNow(now)).toBe("00:30");
    expect(jstDateNow(now)).toBe("2026-10-06");
  });

  it("JSTの深夜0時台でも24:00表記にならない", () => {
    expect(jstTimeNow(new Date("2026-10-05T15:00:00Z"))).toBe("00:00");
  });

  it("日付はYYYY-MM-DD形式(UTC14:59 → JST23:59は同日)", () => {
    expect(jstDateNow(new Date("2026-10-05T14:59:00Z"))).toBe("2026-10-05");
  });
});

describe("selectReminderTargets", () => {
  it("今日outcome入りの記録があるユーザーを除く", () => {
    expect(selectReminderTargets(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
  });

  it("記録済みユーザーがいなければ全員が対象", () => {
    expect(selectReminderTargets(["a", "b"], [])).toEqual(["a", "b"]);
  });

  it("全員記録済みなら対象は空", () => {
    expect(selectReminderTargets(["a"], new Set(["a", "x"]))).toEqual([]);
  });
});

describe("isStaleSubscriptionError", () => {
  it("404と410は失効扱い", () => {
    expect(isStaleSubscriptionError({ statusCode: 404 })).toBe(true);
    expect(isStaleSubscriptionError({ statusCode: 410 })).toBe(true);
  });

  it("それ以外のステータスや通常のErrorは失効扱いにしない", () => {
    expect(isStaleSubscriptionError({ statusCode: 500 })).toBe(false);
    expect(isStaleSubscriptionError({ statusCode: 429 })).toBe(false);
    expect(isStaleSubscriptionError(new Error("network"))).toBe(false);
    expect(isStaleSubscriptionError(null)).toBe(false);
    expect(isStaleSubscriptionError(undefined)).toBe(false);
  });
});

describe("isAuthorizedCall", () => {
  const key = "service-role-key-value";

  it("service role key と一致する Bearer だけを通す", () => {
    expect(isAuthorizedCall(`Bearer ${key}`, key)).toBe(true);
  });

  it("anon キーなど別の値・前後の差・ヘッダ無し・形式違いは通さない", () => {
    expect(isAuthorizedCall("Bearer anon-key", key)).toBe(false);
    expect(isAuthorizedCall(`Bearer ${key}x`, key)).toBe(false);
    expect(isAuthorizedCall(`Bearer ${key.slice(0, -1)}`, key)).toBe(false);
    expect(isAuthorizedCall(key, key)).toBe(false);
    expect(isAuthorizedCall(null, key)).toBe(false);
    expect(isAuthorizedCall("", key)).toBe(false);
  });

  it("サーバー側のキーが空のときは、空の Bearer でも通さない", () => {
    expect(isAuthorizedCall("Bearer ", "")).toBe(false);
    expect(isAuthorizedCall("Bearer x", "")).toBe(false);
  });
});

describe("displayNameFromEmail", () => {
  it("@より前を返す", () => {
    expect(displayNameFromEmail("taro@example.com")).toBe("taro");
  });

  it("空・null・undefined・@始まりはnull", () => {
    expect(displayNameFromEmail("")).toBeNull();
    expect(displayNameFromEmail(null)).toBeNull();
    expect(displayNameFromEmail(undefined)).toBeNull();
    expect(displayNameFromEmail("@example.com")).toBeNull();
    expect(displayNameFromEmail("  @example.com")).toBeNull();
  });
});

describe("payload", () => {
  it("リマインドは今日の記録を促し、ホームへ遷移する", () => {
    expect(JSON.parse(reminderPayload())).toEqual({
      title: "あさノート",
      body: "今日の記録がまだのようです",
      url: "/",
    });
  });

  it("パートナー通知は名前があれば含め、タイムラインへ遷移する", () => {
    expect(JSON.parse(partnerRecordPayload("taro"))).toEqual({
      title: "あさノート",
      body: "taroさんがきろくを追加しました",
      url: "/timeline",
    });
  });

  it("名前が無ければ汎用文言になる", () => {
    expect(JSON.parse(partnerRecordPayload(null)).body).toBe("パートナーがきろくを追加しました");
  });
});

describe("sendToSubscriptions", () => {
  const subs: PushSubscriptionRow[] = [
    { id: "s1", endpoint: "https://push/1", p256dh: "k1", auth_key: "a1" },
    { id: "s2", endpoint: "https://push/2", p256dh: "k2", auth_key: "a2" },
    { id: "s3", endpoint: "https://push/3", p256dh: "k3", auth_key: "a3" },
  ];

  afterEach(() => vi.restoreAllMocks());

  it("購読ごとにendpointとkeysを渡して送る", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await sendToSubscriptions(send, [subs[0]!], "payload");
    expect(send).toHaveBeenCalledWith(
      { endpoint: "https://push/1", keys: { p256dh: "k1", auth: "a1" } },
      "payload"
    );
    expect(result).toEqual({ sent: 1, staleSubscriptionIds: [] });
  });

  it("404/410の購読は削除対象に集め、送信数に含めない", async () => {
    const send = vi.fn(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith("/2")) throw { statusCode: 410 };
      if (sub.endpoint.endsWith("/3")) throw { statusCode: 404 };
    });
    const result = await sendToSubscriptions(send, subs, "p");
    expect(result.sent).toBe(1);
    expect(result.staleSubscriptionIds.sort()).toEqual(["s2", "s3"]);
  });

  it("一時的なエラーは購読を残し(削除対象にしない)警告ログのみ", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const send = vi.fn().mockRejectedValue({ statusCode: 500 });
    const result = await sendToSubscriptions(send, subs, "p");
    expect(result).toEqual({ sent: 0, staleSubscriptionIds: [] });
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it("購読が無ければ何も送らない", async () => {
    const send = vi.fn();
    expect(await sendToSubscriptions(send, [], "p")).toEqual({ sent: 0, staleSubscriptionIds: [] });
    expect(send).not.toHaveBeenCalled();
  });
});
