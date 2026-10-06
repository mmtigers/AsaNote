import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runReminders, type ReminderDb, type ReminderQuery } from "./reminderHandler";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

// 表を配列で持ち、eq / in / not を絞り込みとして適用する最小の偽DB。
// failTables に入れた表は取得時にエラーを返す。削除は deleted に記録する。
function fakeDb(tables: Tables, failTables: string[] = []) {
  const deleted: { table: string; column: string; values: string[] }[] = [];
  const db: ReminderDb = {
    from(table) {
      const filters: ((row: Row) => boolean)[] = [];
      const query: ReminderQuery = {
        eq(column, value) {
          filters.push((row) => row[column] === value);
          return query;
        },
        in(column, values) {
          filters.push((row) => values.includes(row[column] as string));
          return query;
        },
        not(column, operator, value) {
          if (operator !== "is" || value !== null) throw new Error(`未対応の not: ${operator}`);
          filters.push((row) => row[column] !== null && row[column] !== undefined);
          return query;
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
          in: async (column, values) => {
            deleted.push({ table, column, values });
            return { error: null };
          },
        }),
      };
    },
  };
  return { db, deleted };
}

const NOW = new Date("2026-10-05T12:00:00Z"); // JST 2026-10-05 21:00
const sub = (id: string, userId: string) => ({
  id,
  user_id: userId,
  endpoint: `https://push.example/${id}`,
  p256dh: `p-${id}`,
  auth_key: `a-${id}`,
});

const baseTables = (): Tables => ({
  evening_notification_settings: [
    { user_id: "mom", enabled: true, reminder_time: "21:00:00" },
    { user_id: "dad", enabled: true, reminder_time: "21:00:00" },
    { user_id: "solo", enabled: true, reminder_time: "21:30:00" },
    { user_id: "off", enabled: false, reminder_time: "21:00:00" },
  ],
  group_members: [
    { user_id: "mom", group_id: "g1" },
    { user_id: "dad", group_id: "g1" },
    { user_id: "off", group_id: "g2" },
  ],
  evening_records: [],
  evening_push_subscriptions: [sub("s-mom-1", "mom"), sub("s-mom-2", "mom"), sub("s-dad", "dad")],
});

describe("runReminders", () => {
  let send: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    send = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("リマインド時刻(JST・分単位)が合う有効なユーザーだけに、全購読へ送る", async () => {
    const { db } = fakeDb(baseTables());
    const result = await runReminders(db, send, NOW);

    expect(result).toEqual({ status: 200, body: { checked: 2, targeted: 2, sent: 3 } });
    const endpoints = send.mock.calls.map(([subscription]) => subscription.endpoint).sort();
    expect(endpoints).toEqual([
      "https://push.example/s-dad",
      "https://push.example/s-mom-1",
      "https://push.example/s-mom-2",
    ]);
    // 送る内容は固定の文言と、タップで開く先。
    expect(JSON.parse(send.mock.calls[0]![1] as string)).toMatchObject({ title: "よるノート", url: "/" });
  });

  it("時刻が合うユーザーがいなければ何も送らない", async () => {
    const { db } = fakeDb(baseTables());
    const result = await runReminders(db, send, new Date("2026-10-05T03:00:00Z")); // JST 12:00
    expect(result).toEqual({ status: 200, body: { checked: 0, sent: 0 } });
    expect(send).not.toHaveBeenCalled();
  });

  it("UTCの日付をまたぐJSTの時刻も正しく合わせる(JST 翌0:30)", async () => {
    const tables = baseTables();
    tables.evening_notification_settings = [{ user_id: "mom", enabled: true, reminder_time: "00:30:00" }];
    const { db } = fakeDb(tables);
    const result = await runReminders(db, send, new Date("2026-10-05T15:30:00Z"));
    expect(result.body).toMatchObject({ checked: 1 });
  });

  it("本人が今夜の様子まで記録済みなら送らない(同じグループのもう一方にも送らない)", async () => {
    const tables = baseTables();
    tables.evening_records = [{ user_id: "mom", record_date: "2026-10-05", outcome: "calm" }];
    const { db } = fakeDb(tables);
    const result = await runReminders(db, send, NOW);
    expect(result).toEqual({ status: 200, body: { checked: 2, sent: 0 } });
    expect(send).not.toHaveBeenCalled();
  });

  it("様子が未入力の記録や、別の日の記録は『記録済み』に数えない", async () => {
    const tables = baseTables();
    tables.evening_records = [
      { user_id: "mom", record_date: "2026-10-05", outcome: null },
      { user_id: "dad", record_date: "2026-10-04", outcome: "storm" },
    ];
    const { db } = fakeDb(tables);
    const result = await runReminders(db, send, NOW);
    expect(result.body).toMatchObject({ targeted: 2, sent: 3 });
  });

  it("別のグループの記録は影響しない", async () => {
    const tables = baseTables();
    tables.group_members.push({ user_id: "other", group_id: "g9" });
    tables.evening_records = [{ user_id: "other", record_date: "2026-10-05", outcome: "calm" }];
    const { db } = fakeDb(tables);
    const result = await runReminders(db, send, NOW);
    expect(result.body).toMatchObject({ targeted: 2 });
  });

  it("グループ未所属のユーザーも、自分の記録だけで判断して送る", async () => {
    const tables = baseTables();
    tables.evening_notification_settings = [{ user_id: "solo", enabled: true, reminder_time: "21:00:00" }];
    tables.evening_push_subscriptions = [sub("s-solo", "solo")];
    const { db } = fakeDb(tables);
    const result = await runReminders(db, send, NOW);
    expect(result).toEqual({ status: 200, body: { checked: 1, targeted: 1, sent: 1 } });
  });

  it("失効した購読(410/404)だけを削除し、一時的な失敗の購読は残す", async () => {
    const { db, deleted } = fakeDb(baseTables());
    send.mockImplementation(async (subscription: { endpoint: string }) => {
      if (subscription.endpoint.endsWith("s-mom-1")) throw { statusCode: 410 };
      if (subscription.endpoint.endsWith("s-mom-2")) throw { statusCode: 503 };
    });
    const result = await runReminders(db, send, NOW);

    expect(result.body).toMatchObject({ sent: 1 });
    expect(deleted).toEqual([{ table: "evening_push_subscriptions", column: "id", values: ["s-mom-1"] }]);
  });

  it("失効が無ければ購読を削除しない", async () => {
    const { db, deleted } = fakeDb(baseTables());
    await runReminders(db, send, NOW);
    expect(deleted).toEqual([]);
  });

  it("購読が1件も無くても落ちずに0件と返す", async () => {
    const tables = baseTables();
    tables.evening_push_subscriptions = [];
    const { db } = fakeDb(tables);
    const result = await runReminders(db, send, NOW);
    expect(result.body).toMatchObject({ checked: 2, targeted: 2, sent: 0 });
  });

  describe("DBの取得に失敗したとき", () => {
    it.each([
      "evening_notification_settings",
      "group_members",
      "evening_records",
      "evening_push_subscriptions",
    ])("%s の失敗は500にして、何も送らない", async (table) => {
      const { db } = fakeDb(baseTables(), [table]);
      const result = await runReminders(db, send, NOW);
      expect(result).toEqual({ status: 500, body: `failed to load ${table}` });
      expect(send).not.toHaveBeenCalled();
    });
  });
});
