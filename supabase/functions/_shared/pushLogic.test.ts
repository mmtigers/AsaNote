import { describe, expect, it, vi } from "vitest";
import {
  displayNameFromEmail,
  isAuthorizedCall,
  isStaleSubscriptionError,
  jstDateNow,
  jstTimeNow,
  partnerRecordPayload,
  selectReminderTargets,
  sendToSubscriptions,
  type PushSubscriptionRow,
} from "./pushLogic";

describe("jstTimeNow / jstDateNow", () => {
  it("UTCをJSTに直す(日付をまたぐ場合も)", () => {
    const now = new Date("2026-10-05T12:00:00Z"); // JST 21:00
    expect(jstTimeNow(now)).toBe("21:00");
    expect(jstDateNow(now)).toBe("2026-10-05");
    const late = new Date("2026-10-05T15:30:00Z"); // JST 翌0:30
    expect(jstTimeNow(late)).toBe("00:30");
    expect(jstDateNow(late)).toBe("2026-10-06");
  });
});

describe("selectReminderTargets", () => {
  const memberships = [
    { user_id: "a", group_id: "g1" },
    { user_id: "b", group_id: "g1" },
    { user_id: "c", group_id: "g2" },
  ];

  it("本人が記録済みなら除く", () => {
    expect(selectReminderTargets(["a", "c"], ["a"], memberships)).toEqual(["c"]);
  });

  it("同じグループの誰かが記録済みなら除く", () => {
    expect(selectReminderTargets(["a", "b", "c"], ["b"], memberships)).toEqual(["c"]);
  });

  it("グループ未所属は本人の記録だけで判断する", () => {
    expect(selectReminderTargets(["x", "y"], ["y"], memberships)).toEqual(["x"]);
  });
});

describe("isStaleSubscriptionError", () => {
  it("404/410だけが失効", () => {
    expect(isStaleSubscriptionError({ statusCode: 410 })).toBe(true);
    expect(isStaleSubscriptionError({ statusCode: 404 })).toBe(true);
    expect(isStaleSubscriptionError({ statusCode: 500 })).toBe(false);
    expect(isStaleSubscriptionError(null)).toBe(false);
  });
});

describe("sendToSubscriptions", () => {
  const subs: PushSubscriptionRow[] = [
    { id: "1", endpoint: "e1", p256dh: "p1", auth_key: "a1" },
    { id: "2", endpoint: "e2", p256dh: "p2", auth_key: "a2" },
    { id: "3", endpoint: "e3", p256dh: "p3", auth_key: "a3" },
  ];

  it("成功数を数え、失効した購読のidだけを返す(一時的な失敗は残す)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const send = vi.fn(async (s: { endpoint: string }) => {
      if (s.endpoint === "e2") throw { statusCode: 410 };
      if (s.endpoint === "e3") throw { statusCode: 500 };
    });
    const result = await sendToSubscriptions(send, subs, "payload");
    expect(result).toEqual({ sent: 1, staleSubscriptionIds: ["2"] });
    expect(send).toHaveBeenCalledWith({ endpoint: "e1", keys: { p256dh: "p1", auth: "a1" } }, "payload");
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

describe("displayNameFromEmail / partnerRecordPayload", () => {
  it("メールの@より前を表示名にし、無ければ null", () => {
    expect(displayNameFromEmail("mom@example.com")).toBe("mom");
    expect(displayNameFromEmail(" @example.com")).toBeNull();
    expect(displayNameFromEmail(null)).toBeNull();
    expect(displayNameFromEmail(undefined)).toBeNull();
  });

  it("通知文言は名前の有無で変わり、タイムラインへ誘導する", () => {
    expect(JSON.parse(partnerRecordPayload("mom"))).toEqual({
      title: "よるノート",
      body: "momさんが今夜の記録を追加しました",
      url: "/timeline",
    });
    expect(JSON.parse(partnerRecordPayload(null)).body).toBe("パートナーが今夜の記録を追加しました");
  });
});
