import { afterEach, describe, expect, it, vi } from "vitest";
import {
  displayNameFromEmail,
  isAuthorizedSecret,
  MIN_SECRET_LENGTH,
  isStaleSubscriptionError,
  jstDateNow,
  jstTimeNow,
  minutesOfDay,
  partnerRecordPayload,
  REMINDER_CATCHUP_WINDOW_MINUTES,
  reminderPayload,
  selectDueReminderUserIds,
  selectReminderTargets,
  selectUsersToRelease,
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

describe("minutesOfDay", () => {
  it("HH:MM と HH:MM:SS を分数にする", () => {
    expect(minutesOfDay("21:00")).toBe(1260);
    expect(minutesOfDay("21:00:00")).toBe(1260);
    expect(minutesOfDay("00:00")).toBe(0);
  });
  it("不正な値は null", () => {
    expect(minutesOfDay("24:00")).toBeNull();
    expect(minutesOfDay("9:00")).toBeNull();
    expect(minutesOfDay("abc")).toBeNull();
  });
});

describe("selectDueReminderUserIds", () => {
  // JST 21:00 = UTC 12:00。
  const at = (utc: string) => new Date(`2026-10-05T${utc}Z`);
  const settings = [{ user_id: "a", reminder_time: "21:00:00" }];

  it("設定時刻ちょうどは対象", () => {
    expect(selectDueReminderUserIds(settings, at("12:00:30"), [])).toEqual(["a"]);
  });

  it("設定時刻の前は対象外", () => {
    expect(selectDueReminderUserIds(settings, at("11:59:59"), [])).toEqual([]);
  });

  it("N分以内(N-1分後)は対象、ちょうどN分後は対象外", () => {
    const n = REMINDER_CATCHUP_WINDOW_MINUTES;
    expect(selectDueReminderUserIds(settings, at(`12:${String(n - 1).padStart(2, "0")}:59`), [])).toEqual(["a"]);
    expect(selectDueReminderUserIds(settings, at(`12:${String(n).padStart(2, "0")}:00`), [])).toEqual([]);
  });

  it("窓の幅は引数で変えられる", () => {
    expect(selectDueReminderUserIds(settings, at("12:04:00"), [], 5)).toEqual(["a"]);
    expect(selectDueReminderUserIds(settings, at("12:05:00"), [], 5)).toEqual([]);
  });

  it("今日送信済みのユーザーは除く", () => {
    const two = [...settings, { user_id: "b", reminder_time: "21:05:00" }];
    expect(selectDueReminderUserIds(two, at("12:07:00"), ["a"])).toEqual(["b"]);
  });

  it("JSTで判定する(UTC21:00は対象外、JST翌日6時)", () => {
    expect(selectDueReminderUserIds(settings, at("21:00:00"), [])).toEqual([]);
  });

  it("日付をまたぐ取り戻しはしない(23:55設定を翌0:03に実行)", () => {
    const late = [{ user_id: "a", reminder_time: "23:55:00" }];
    // JST 2026-10-06 00:03 = UTC 2026-10-05 15:03
    expect(selectDueReminderUserIds(late, at("15:03:00"), [])).toEqual([]);
    // 同日内の 23:58(UTC14:58)は対象
    expect(selectDueReminderUserIds(late, at("14:58:00"), [])).toEqual(["a"]);
  });

  it("0:00設定は日付が変わった直後から対象", () => {
    const midnight = [{ user_id: "a", reminder_time: "00:00:00" }];
    expect(selectDueReminderUserIds(midnight, at("15:00:10"), [])).toEqual(["a"]);
  });

  it("不正な時刻の設定は無視する", () => {
    expect(selectDueReminderUserIds([{ user_id: "a", reminder_time: "bad" }], at("12:00:00"), [])).toEqual([]);
  });
});

describe("selectUsersToRelease", () => {
  const subs = [
    { id: "s1", user_id: "a" },
    { id: "s2", user_id: "a" },
    { id: "s3", user_id: "b" },
  ];
  it("1件でも成功したユーザーは印を残す", () => {
    expect(selectUsersToRelease(subs, ["s2"])).toEqual(["b"]);
  });
  it("全滅したユーザーは印を外す", () => {
    expect(selectUsersToRelease(subs, [])).toEqual(["a", "b"]);
  });
  it("購読が無いユーザーは対象に含まれない", () => {
    expect(selectUsersToRelease([], [])).toEqual([]);
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

  it("別のグループの記録では除かない", () => {
    expect(selectReminderTargets(["a", "c"], ["c"], memberships)).toEqual(["a"]);
  });

  it("グループ未所属は本人の記録だけで判断する", () => {
    expect(selectReminderTargets(["x", "y"], ["y"], memberships)).toEqual(["x"]);
  });

  it("誰も記録していなければ全員が対象", () => {
    expect(selectReminderTargets(["a", "b"], [], memberships)).toEqual(["a", "b"]);
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

describe("isAuthorizedSecret", () => {
  const secret = "0123456789abcdef0123456789abcdef";

  it("設定した合言葉と一致するときだけ通す", () => {
    expect(isAuthorizedSecret(secret, secret)).toBe(true);
  });

  it("別の値・前後の差・ヘッダ無しは通さない", () => {
    expect(isAuthorizedSecret("other-secret-value-xxxxxxxxxxxxxxxx", secret)).toBe(false);
    expect(isAuthorizedSecret(`${secret}x`, secret)).toBe(false);
    expect(isAuthorizedSecret(secret.slice(0, -1), secret)).toBe(false);
    expect(isAuthorizedSecret(`Bearer ${secret}`, secret)).toBe(false);
    expect(isAuthorizedSecret(null, secret)).toBe(false);
    expect(isAuthorizedSecret("", secret)).toBe(false);
  });

  it("サーバー側の合言葉が未設定・空・短すぎるときは、一致していても通さない", () => {
    expect(isAuthorizedSecret(secret, undefined)).toBe(false);
    expect(isAuthorizedSecret("", "")).toBe(false);
    const tooShort = "a".repeat(MIN_SECRET_LENGTH - 1);
    expect(isAuthorizedSecret(tooShort, tooShort)).toBe(false);
    const minimum = "a".repeat(MIN_SECRET_LENGTH);
    expect(isAuthorizedSecret(minimum, minimum)).toBe(true);
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
