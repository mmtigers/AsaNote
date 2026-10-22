import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { SendNotification } from "./pushLogic";
import { runPartnerNotify, type PartnerDb, type PartnerQuery } from "./partnerHandler";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

// 表を配列で持ち、eq / neq / in を絞り込みとして適用する最小の偽DB。maybeSingle は本物と同じく、
// 0件なら null、2件以上ならエラー(1ユーザー1グループが前提)を返す。
// failTables に入れた表は取得時にエラーを返す。削除は表へ反映し、deleted にも記録する。
function fakeDb(tables: Tables, failTables: string[] = []) {
  const deleted: { table: string; ids: string[] }[] = [];
  const db: PartnerDb = {
    from(table) {
      const filters: ((row: Row) => boolean)[] = [];
      const rows = () => (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
      const failed = () => failTables.includes(table);
      const query: PartnerQuery = {
        eq(column, value) {
          filters.push((row) => row[column] === value);
          return query;
        },
        neq(column, value) {
          filters.push((row) => row[column] !== value);
          return query;
        },
        in(column, values) {
          filters.push((row) => values.includes(row[column] as string));
          return query;
        },
        maybeSingle() {
          if (failed()) return Promise.resolve({ data: null, error: new Error(`${table} failed`) });
          const found = rows();
          if (found.length > 1) return Promise.resolve({ data: null, error: new Error("multiple rows returned") });
          return Promise.resolve({ data: found[0] ?? null, error: null });
        },
        then(onfulfilled, onrejected) {
          const result = failed()
            ? { data: null, error: new Error(`${table} failed`) }
            : { data: rows(), error: null };
          return Promise.resolve(result).then(onfulfilled, onrejected);
        },
      };
      return {
        select: () => query,
        delete: () => ({
          in: (column, values) => {
            deleted.push({ table, ids: values });
            tables[table] = (tables[table] ?? []).filter((row) => !values.includes(row[column] as string));
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
  };
  return { db, deleted, tables };
}

const sub = (id: string, userId: string) => ({
  id,
  user_id: userId,
  endpoint: `https://push.example/${id}`,
  p256dh: `p-${id}`,
  auth_key: `a-${id}`,
});

const baseTables = (): Tables => ({
  group_members: [
    { user_id: "mom", group_id: "g1" },
    { user_id: "dad", group_id: "g1" },
    { user_id: "grandma", group_id: "g1" },
    { user_id: "outsider", group_id: "g2" },
  ],
  notification_settings: [
    { user_id: "mom", notify_partner_record: true },
    { user_id: "dad", notify_partner_record: true },
    { user_id: "grandma", notify_partner_record: false },
    { user_id: "outsider", notify_partner_record: true },
  ],
  push_subscriptions: [
    sub("s-mom", "mom"),
    sub("s-dad-1", "dad"),
    sub("s-dad-2", "dad"),
    sub("s-grandma", "grandma"),
    sub("s-outsider", "outsider"),
  ],
});

const sentEndpoints = (send: Mock<SendNotification>) =>
  send.mock.calls.map(([subscription]) => subscription.endpoint).sort();
const email = (value: string | null | undefined) => vi.fn().mockResolvedValue(value);

describe("runPartnerNotify(パートナーの記録通知)", () => {
  let send: Mock<SendNotification>;

  beforeEach(() => {
    send = vi.fn<SendNotification>().mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("同じグループで通知をONにしたパートナーの全購読だけに、記録した人の名前で送る", async () => {
    const { db } = fakeDb(baseTables());
    const getEmail = email("taro.yamada@example.com");

    const result = await runPartnerNotify(db, send, "mom", getEmail);

    expect(result).toEqual({ status: 200, body: { partners: 2, targeted: 1, sent: 2 } });
    expect(sentEndpoints(send)).toEqual(["https://push.example/s-dad-1", "https://push.example/s-dad-2"]);
    expect(getEmail).toHaveBeenCalledWith("mom");
    const payload = JSON.parse(send.mock.calls[0]![1] as string);
    expect(payload).toMatchObject({ title: "あさノート", url: "/timeline" });
    expect(payload.body).toContain("taro.yamada");
  });

  it("記録した本人・設定がOFFの人・別グループの人には送らない", async () => {
    const tables = baseTables();
    const { db } = fakeDb(tables);

    await runPartnerNotify(db, send, "mom", email("mom@example.com"));

    const endpoints = sentEndpoints(send);
    expect(endpoints).not.toContain("https://push.example/s-mom"); // 本人
    expect(endpoints).not.toContain("https://push.example/s-grandma"); // 通知がOFF
    expect(endpoints).not.toContain("https://push.example/s-outsider"); // 別グループ
  });

  it("グループに入っていなければ、何も送らない", async () => {
    const tables = baseTables();
    tables.group_members = [];
    const { db } = fakeDb(tables);

    const result = await runPartnerNotify(db, send, "mom", email("mom@example.com"));

    expect(result).toEqual({ status: 200, body: { partners: 0, sent: 0 } });
    expect(send).not.toHaveBeenCalled();
  });

  it("グループに自分しかいなければ(パートナーがいない)、何も送らない", async () => {
    const tables = baseTables();
    tables.group_members = [{ user_id: "mom", group_id: "g1" }];
    const { db } = fakeDb(tables);

    const result = await runPartnerNotify(db, send, "mom", email("mom@example.com"));

    expect(result).toEqual({ status: 200, body: { partners: 0, sent: 0 } });
    expect(send).not.toHaveBeenCalled();
  });

  it("パートナー全員が通知OFFなら、何も送らず、メールも取りに行かない", async () => {
    const tables = baseTables();
    tables.notification_settings = tables.notification_settings!.map((row) => ({ ...row, notify_partner_record: false }));
    const { db } = fakeDb(tables);
    const getEmail = email("mom@example.com");

    const result = await runPartnerNotify(db, send, "mom", getEmail);

    expect(result).toEqual({ status: 200, body: { partners: 2, sent: 0 } });
    expect(send).not.toHaveBeenCalled();
    expect(getEmail).not.toHaveBeenCalled();
  });

  it("通知をONにしたパートナーに購読が無ければ、送らずに成功で終わる", async () => {
    const tables = baseTables();
    tables.push_subscriptions = [sub("s-mom", "mom")];
    const { db } = fakeDb(tables);

    const result = await runPartnerNotify(db, send, "mom", email("mom@example.com"));

    expect(result).toEqual({ status: 200, body: { partners: 2, targeted: 1, sent: 0 } });
    expect(send).not.toHaveBeenCalled();
  });

  it("メールが取れなければ、名前なしの文言で送る", async () => {
    const { db } = fakeDb(baseTables());

    await runPartnerNotify(db, send, "mom", email(undefined));

    const payload = JSON.parse(send.mock.calls[0]![1] as string);
    expect(payload.body).toBe("パートナーがきろくを追加しました");
  });

  it("失効した購読(410 / 404)はその場で削除する。それ以外のエラーの購読は残す", async () => {
    const { db, deleted, tables } = fakeDb(baseTables());
    send.mockImplementation(async (subscription: { endpoint: string }) => {
      if (subscription.endpoint.endsWith("s-dad-1")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      if (subscription.endpoint.endsWith("s-dad-2")) throw Object.assign(new Error("server error"), { statusCode: 500 });
    });

    const result = await runPartnerNotify(db, send, "mom", email("mom@example.com"));

    expect(result.body).toEqual({ partners: 2, targeted: 1, sent: 0 });
    expect(deleted).toEqual([{ table: "push_subscriptions", ids: ["s-dad-1"] }]);
    expect(tables.push_subscriptions!.map((row) => row.id)).toContain("s-dad-2");
  });

  describe("DBの取得に失敗したとき(送らずに500を返す)", () => {
    it.each([
      ["group_members", "failed to load group_members"],
      ["notification_settings", "failed to load notification_settings"],
      ["push_subscriptions", "failed to load push_subscriptions"],
    ])("%s の取得に失敗したら500", async (failTable, message) => {
      const { db } = fakeDb(baseTables(), [failTable]);

      const result = await runPartnerNotify(db, send, "mom", email("mom@example.com"));

      expect(result).toEqual({ status: 500, body: message });
      expect(send).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });

    it("同じグループのメンバーの取得に失敗したら500(最初の group_members の取得は成功している場合)", async () => {
      const tables = baseTables();
      const { db } = fakeDb(tables);
      // 最初の取得(maybeSingle)は成功させ、2回目(メンバー一覧)だけ失敗させる。
      let calls = 0;
      const original = db.from.bind(db);
      db.from = (table) => {
        const handle = original(table);
        if (table !== "group_members") return handle;
        calls += 1;
        if (calls < 2) return handle;
        return {
          ...handle,
          select: () => {
            const query: PartnerQuery = {
              eq: () => query,
              neq: () => query,
              in: () => query,
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
              then: (onfulfilled, onrejected) =>
                Promise.resolve({ data: null, error: new Error("members failed") }).then(onfulfilled, onrejected),
            };
            return query;
          },
        };
      };

      const result = await runPartnerNotify(db, send, "mom", email("mom@example.com"));

      expect(result).toEqual({ status: 500, body: "failed to load group members" });
      expect(send).not.toHaveBeenCalled();
    });
  });
});

describe("runPartnerNotify(コメント通知)", () => {
  let send: Mock<SendNotification>;

  beforeEach(() => {
    send = vi.fn<SendNotification>().mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("notify_partner_comment がONのパートナーだけに、コメントした人の名前で送る(きろく追加の設定は見ない)", async () => {
    const tables = baseTables();
    // きろく追加はONでもコメントはOFF、またはその逆、を混ぜて、見ている列が違うことを確かめる。
    tables.notification_settings = [
      { user_id: "mom", notify_partner_record: true, notify_partner_comment: false },
      { user_id: "dad", notify_partner_record: false, notify_partner_comment: true },
      { user_id: "grandma", notify_partner_record: true, notify_partner_comment: false },
    ];
    const { db } = fakeDb(tables);

    const result = await runPartnerNotify(db, send, "mom", email("taro.yamada@example.com"), "comment");

    expect(result).toEqual({ status: 200, body: { partners: 2, targeted: 1, sent: 2 } });
    expect(sentEndpoints(send)).toEqual(["https://push.example/s-dad-1", "https://push.example/s-dad-2"]);
    const payload = JSON.parse(send.mock.calls[0]![1] as string);
    expect(payload).toMatchObject({ title: "あさノート", url: "/timeline" });
    expect(payload.body).toBe("taro.yamadaさんがコメントしました");
  });

  it("コメントした本人には送らない", async () => {
    const tables = baseTables();
    tables.notification_settings = [
      { user_id: "mom", notify_partner_comment: true },
      { user_id: "dad", notify_partner_comment: true },
    ];
    const { db } = fakeDb(tables);

    await runPartnerNotify(db, send, "dad", email(null), "comment");

    expect(sentEndpoints(send)).toEqual(["https://push.example/s-mom"]);
    expect(JSON.parse(send.mock.calls[0]![1] as string).body).toBe("パートナーがコメントしました");
  });
});
