import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runPartnerNotify } from "./partnerHandler";
import type { ReminderDb, ReminderQuery } from "./reminderHandler";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

// reminderHandler.test.ts と同じ最小の偽DB(eq / neq / in)。
function fakeDb(tables: Tables, failTables: string[] = []) {
  const deleted: { table: string; values: string[] }[] = [];
  const db: ReminderDb = {
    from(table) {
      const filters: ((row: Row) => boolean)[] = [];
      const query: ReminderQuery = {
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
        not() {
          throw new Error("未対応");
        },
        then(onfulfilled, onrejected) {
          const result = failTables.includes(table)
            ? { data: null, error: new Error(`${table} failed`) }
            : { data: (tables[table] ?? []).filter((row) => filters.every((f) => f(row))), error: null };
          return Promise.resolve(result).then(onfulfilled, onrejected);
        },
      };
      return {
        select: () => query,
        delete: () => ({
          in: async (_column, values) => {
            deleted.push({ table, values });
            return { error: null };
          },
        }),
      };
    },
  };
  return { db, deleted };
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
    { user_id: "other", group_id: "g2" },
  ],
  evening_notification_settings: [
    { user_id: "dad", notify_partner_record: true },
    { user_id: "other", notify_partner_record: true },
  ],
  evening_push_subscriptions: [sub("s-dad", "dad"), sub("s-other", "other"), sub("s-mom", "mom")],
});

const email = async () => "mom@example.com";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("runPartnerNotify", () => {
  it("同じグループで通知をONにしたパートナーの購読だけに、記録した人の名前で送る", async () => {
    const { db } = fakeDb(baseTables());
    const send = vi.fn().mockResolvedValue({});

    const result = await runPartnerNotify(db, send, "mom", email);

    expect(result).toEqual({ status: 200, body: { partners: 1, targeted: 1, sent: 1 } });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].endpoint).toBe("https://push.example/s-dad");
    expect(JSON.parse(send.mock.calls[0][1])).toMatchObject({ title: "よるノート", body: "momさんが今夜の記録を追加しました" });
  });

  it("記録した本人・別グループ・設定がOFFの人には送らない", async () => {
    const tables = baseTables();
    tables.evening_notification_settings = [
      { user_id: "dad", notify_partner_record: false },
      { user_id: "mom", notify_partner_record: true },
      { user_id: "other", notify_partner_record: true },
    ];
    const { db } = fakeDb(tables);
    const send = vi.fn();

    const result = await runPartnerNotify(db, send, "mom", email);

    expect(result.body).toEqual({ partners: 1, sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("グループに入っていなければ何もしない", async () => {
    const { db } = fakeDb(baseTables());
    const send = vi.fn();
    const result = await runPartnerNotify(db, send, "loner", email);
    expect(result).toEqual({ status: 200, body: { partners: 0, sent: 0 } });
    expect(send).not.toHaveBeenCalled();
  });

  it("メールが取れなければ名前なしの文言になる", async () => {
    const { db } = fakeDb(baseTables());
    const send = vi.fn().mockResolvedValue({});
    await runPartnerNotify(db, send, "mom", async () => null);
    expect(JSON.parse(send.mock.calls[0][1]).body).toBe("パートナーが今夜の記録を追加しました");
  });

  it("失効した購読(410)はその場で削除する", async () => {
    const { db, deleted } = fakeDb(baseTables());
    const send = vi.fn().mockRejectedValue({ statusCode: 410 });
    const result = await runPartnerNotify(db, send, "mom", email);
    expect(result.body).toMatchObject({ sent: 0 });
    expect(deleted).toEqual([{ table: "evening_push_subscriptions", values: ["s-dad"] }]);
  });

  it("表の取得に失敗したら500を返し、送らない", async () => {
    for (const table of ["group_members", "evening_notification_settings", "evening_push_subscriptions"]) {
      const { db } = fakeDb(baseTables(), [table]);
      const send = vi.fn();
      const result = await runPartnerNotify(db, send, "mom", email);
      expect(result.status).toBe(500);
      expect(send).not.toHaveBeenCalled();
    }
  });
});

describe("runPartnerNotify(コメント通知)", () => {
  it("notify_partner_comment がONのパートナーだけに、コメントした人の名前で送る(記録追加の設定は見ない)", async () => {
    const tables = baseTables();
    tables.evening_notification_settings = [
      { user_id: "dad", notify_partner_record: false, notify_partner_comment: true },
      { user_id: "other", notify_partner_record: true, notify_partner_comment: true },
    ];
    const { db } = fakeDb(tables);
    const send = vi.fn().mockResolvedValue({});

    const result = await runPartnerNotify(db, send, "mom", email, "comment");

    expect(result).toEqual({ status: 200, body: { partners: 1, targeted: 1, sent: 1 } });
    expect(send.mock.calls[0][0].endpoint).toBe("https://push.example/s-dad");
    expect(JSON.parse(send.mock.calls[0][1])).toMatchObject({ title: "よるノート", body: "momさんがコメントしました", url: "/timeline" });
  });

  it("コメント通知がOFFの人には送らない(記録追加の通知がONでも)", async () => {
    const { db } = fakeDb(baseTables()); // dad は notify_partner_record だけがON
    const send = vi.fn();

    const result = await runPartnerNotify(db, send, "mom", email, "comment");

    expect(result.body).toEqual({ partners: 1, sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("メールが取れなければ名前なしの文言になる", async () => {
    const tables = baseTables();
    tables.evening_notification_settings = [{ user_id: "dad", notify_partner_comment: true }];
    const { db } = fakeDb(tables);
    const send = vi.fn().mockResolvedValue({});
    await runPartnerNotify(db, send, "mom", async () => null, "comment");
    expect(JSON.parse(send.mock.calls[0][1]).body).toBe("パートナーがコメントしました");
  });
});
