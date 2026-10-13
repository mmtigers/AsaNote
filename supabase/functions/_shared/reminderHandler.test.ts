import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { SendNotification } from "./pushLogic";
import { runReminders, type ReminderDb, type ReminderQuery } from "./reminderHandler";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

interface FakeOptions {
  /** 取得時にエラーを返す表。 */
  failTables?: string[];
  /** 印の記録(upsert)をエラーにする。 */
  failClaim?: boolean;
  /** 印を付ける瞬間に、他の実行に先を越されるユーザー(行が既にあったことにする)。 */
  raceUserIds?: string[];
}

// 表を配列で持ち、eq / in / not を絞り込みとして適用する最小の偽DB。
// 印(reminder_deliveries)の upsert(ignoreDuplicates)と delete は、表へ実際に反映する(次の実行に効くため)。
function fakeDb(tables: Tables, options: FakeOptions = {}) {
  const { failTables = [], failClaim = false, raceUserIds = [] } = options;
  const deleted: { table: string; filters: Record<string, unknown> }[] = [];
  const upserts: { table: string; rows: Row[] }[] = [];

  const table = (name: string) => (tables[name] ??= []);

  const db: ReminderDb = {
    from(name) {
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
          const result = failTables.includes(name)
            ? { data: null, error: new Error(`${name} failed`) }
            : { data: table(name).filter((row) => filters.every((f) => f(row))), error: null };
          return Promise.resolve(result).then(onfulfilled, onrejected);
        },
      };

      const removeWhere = (conditions: [string, unknown][]) => {
        deleted.push({ table: name, filters: Object.fromEntries(conditions) });
        tables[name] = table(name).filter(
          (row) =>
            !conditions.every(([column, value]) =>
              Array.isArray(value) ? value.includes(row[column]) : row[column] === value
            )
        );
        return Promise.resolve({ error: null });
      };

      return {
        select: () => query,
        upsert(rows) {
          upserts.push({ table: name, rows });
          return {
            select: () => {
              if (failClaim) return Promise.resolve({ data: null, error: new Error("claim failed") });
              const inserted: Row[] = [];
              for (const row of rows) {
                if (raceUserIds.includes(row.user_id as string)) {
                  // 先を越された: 他の実行が先に入れた行があるので、こちらでは入らない。
                  if (!table(name).some((r) => r.user_id === row.user_id && r.sent_on === row.sent_on)) {
                    table(name).push({ ...row });
                  }
                  continue;
                }
                const exists = table(name).some((r) => r.user_id === row.user_id && r.sent_on === row.sent_on);
                if (exists) continue;
                table(name).push({ ...row });
                inserted.push({ ...row });
              }
              return Promise.resolve({ data: inserted, error: null });
            },
          };
        },
        delete: () => ({
          in: (column, values) => removeWhere([[column, values]]),
          eq: (column, value) => ({ in: (column2, values) => removeWhere([[column, value], [column2, values]]) }),
        }),
      };
    },
  };
  return { db, deleted, upserts, tables };
}

const NOW = new Date("2026-10-05T12:00:00Z"); // JST 2026-10-05 21:00
const TODAY = "2026-10-05";

const sub = (id: string, userId: string) => ({
  id,
  user_id: userId,
  endpoint: `https://push.example/${id}`,
  p256dh: `p-${id}`,
  auth_key: `a-${id}`,
});

const setting = (userId: string, time: string, enabled = true) => ({
  user_id: userId,
  enabled,
  reminder_time: `${time}:00`,
});

const baseTables = (): Tables => ({
  notification_settings: [setting("mom", "21:00"), setting("dad", "21:00"), setting("off", "21:00", false)],
  reminder_deliveries: [],
  group_members: [
    { user_id: "mom", group_id: "g1" },
    { user_id: "dad", group_id: "g1" },
    { user_id: "off", group_id: "g2" },
  ],
  records: [],
  push_subscriptions: [sub("s-mom-1", "mom"), sub("s-mom-2", "mom"), sub("s-dad", "dad"), sub("s-off", "off")],
});

const sentEndpoints = (send: Mock<SendNotification>) =>
  send.mock.calls.map(([subscription]) => subscription.endpoint).sort();
const markerUsers = (tables: Tables, day = TODAY) =>
  (tables.reminder_deliveries ?? []).filter((row) => row.sent_on === day).map((row) => row.user_id).sort();

describe("runReminders(あさノートの未入力リマインド)", () => {
  let send: Mock<SendNotification>;

  beforeEach(() => {
    send = vi.fn<SendNotification>().mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  describe("誰に送るか", () => {
    it("設定時刻(JST)になった有効なユーザーだけに、全購読へ送る(無効の人には送らない)", async () => {
      const { db } = fakeDb(baseTables());
      const result = await runReminders(db, send, NOW);

      expect(result).toEqual({ status: 200, body: { checked: 2, targeted: 2, sent: 3 } });
      expect(sentEndpoints(send)).toEqual([
        "https://push.example/s-dad",
        "https://push.example/s-mom-1",
        "https://push.example/s-mom-2",
      ]);
      // 送る内容は固定の文言と、タップで開く先。
      expect(JSON.parse(send.mock.calls[0]![1] as string)).toMatchObject({ title: "あさノート", url: "/" });
    });

    it("設定時刻から14分後までは「遅れて届ける」対象。15分後(窓の外)と、まだ時刻前の人は対象外", async () => {
      const tables = baseTables();
      tables.notification_settings = [
        setting("late14", "20:46"), // 経過14分: 対象
        setting("late15", "20:45"), // 経過15分: 対象外
        setting("future", "21:01"), // まだ: 対象外
        setting("exact", "21:00"), // ちょうど: 対象
      ];
      tables.group_members = [];
      tables.push_subscriptions = ["late14", "late15", "future", "exact"].map((u) => sub(`s-${u}`, u));
      const { db } = fakeDb(tables);

      const result = await runReminders(db, send, NOW);

      expect(result.body).toMatchObject({ checked: 2, targeted: 2 });
      expect(sentEndpoints(send)).toEqual(["https://push.example/s-exact", "https://push.example/s-late14"]);
    });

    it("JSTの日付が変わる直後(UTCではまだ前日)は、JSTの「今日」で記録を見る", async () => {
      const tables = baseTables();
      tables.notification_settings = [setting("mom", "00:30")];
      tables.group_members = [];
      tables.push_subscriptions = [sub("s-mom", "mom")];
      // JSTの昨日(10-05)の記録は、今日(10-06)の記録ではない。
      tables.records = [{ user_id: "mom", record_date: "2026-10-05", outcome: "smooth" }];
      const { db, tables: after } = fakeDb(tables);

      const result = await runReminders(db, send, new Date("2026-10-05T15:30:00Z")); // JST 10-06 00:30

      expect(result.body).toMatchObject({ checked: 1, targeted: 1, sent: 1 });
      expect(markerUsers(after, "2026-10-06")).toEqual(["mom"]);
    });

    it("設定時刻の人がいなければ何も送らず、印も付けない", async () => {
      const { db, upserts } = fakeDb(baseTables());
      const result = await runReminders(db, send, new Date("2026-10-05T03:00:00Z")); // JST 12:00

      expect(result).toEqual({ status: 200, body: { checked: 0, sent: 0 } });
      expect(send).not.toHaveBeenCalled();
      expect(upserts).toEqual([]);
    });

    it("今日すでに送った(印がある)ユーザーは対象外。昨日の印は関係ない", async () => {
      const tables = baseTables();
      tables.reminder_deliveries = [
        { user_id: "mom", sent_on: TODAY },
        { user_id: "dad", sent_on: "2026-10-04" },
      ];
      const { db } = fakeDb(tables);

      const result = await runReminders(db, send, NOW);

      expect(result.body).toMatchObject({ checked: 1, targeted: 1, sent: 1 });
      expect(sentEndpoints(send)).toEqual(["https://push.example/s-dad"]);
    });
  });

  describe("記録済みなら送らない", () => {
    it("本人が今日の様子(outcome)まで記録済みなら送らない。同じグループのもう一方にも送らない", async () => {
      const tables = baseTables();
      tables.records = [{ user_id: "mom", record_date: TODAY, outcome: "smooth" }];
      const { db, upserts } = fakeDb(tables);

      const result = await runReminders(db, send, NOW);

      expect(result).toEqual({ status: 200, body: { checked: 2, sent: 0 } });
      expect(send).not.toHaveBeenCalled();
      expect(upserts).toEqual([]); // 送らないので、印も付けない
    });

    it("同じグループの誰かが記録済みなら、記録していないほうにも送らない", async () => {
      const tables = baseTables();
      tables.notification_settings = [setting("mom", "21:00")]; // dad は due ではないが、同じグループで記録済み
      tables.records = [{ user_id: "dad", record_date: TODAY, outcome: "smooth" }];
      const { db } = fakeDb(tables);

      const result = await runReminders(db, send, NOW);

      expect(result).toEqual({ status: 200, body: { checked: 1, sent: 0 } });
      expect(send).not.toHaveBeenCalled();
    });

    it("outcome が空の記録(途中)・昨日の記録・別グループの記録は、記録済みとみなさない", async () => {
      const tables = baseTables();
      tables.records = [
        { user_id: "mom", record_date: TODAY, outcome: null },
        { user_id: "dad", record_date: "2026-10-04", outcome: "smooth" },
        { user_id: "off", record_date: TODAY, outcome: "smooth" }, // 別グループ(g2)
      ];
      const { db } = fakeDb(tables);

      const result = await runReminders(db, send, NOW);

      expect(result.body).toMatchObject({ checked: 2, targeted: 2, sent: 3 });
    });
  });

  describe("二重送信を防ぐ印(reminder_deliveries)", () => {
    it("送るユーザーに、今日の印を付ける", async () => {
      const { db, tables } = fakeDb(baseTables());
      await runReminders(db, send, NOW);
      expect(markerUsers(tables)).toEqual(["dad", "mom"]);
    });

    it("続けて2回実行しても、2回目は送らない(1分ごとの実行で二重に届かない)", async () => {
      const { db } = fakeDb(baseTables());

      const first = await runReminders(db, send, NOW);
      const second = await runReminders(db, send, new Date(NOW.getTime() + 60_000));

      expect(first.body).toMatchObject({ targeted: 2, sent: 3 });
      expect(second).toEqual({ status: 200, body: { checked: 0, sent: 0 } });
      expect(send).toHaveBeenCalledTimes(3);
    });

    it("印を付ける瞬間に他の実行に先を越されたユーザーには、送らない", async () => {
      const { db } = fakeDb(baseTables(), { raceUserIds: ["mom"] });

      const result = await runReminders(db, send, NOW);

      expect(result.body).toEqual({ checked: 2, targeted: 1, sent: 1 });
      expect(sentEndpoints(send)).toEqual(["https://push.example/s-dad"]);
    });

    it("全員が先を越されたら、何も送らない", async () => {
      const { db } = fakeDb(baseTables(), { raceUserIds: ["mom", "dad"] });

      const result = await runReminders(db, send, NOW);

      expect(result).toEqual({ status: 200, body: { checked: 2, targeted: 0, sent: 0 } });
      expect(send).not.toHaveBeenCalled();
    });

    it("印の記録に失敗したら、送らずに500を返す", async () => {
      const { db } = fakeDb(baseTables(), { failClaim: true });

      const result = await runReminders(db, send, NOW);

      expect(result).toEqual({ status: 500, body: "failed to record reminder_deliveries" });
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe("送信に失敗したとき", () => {
    it("購読があるのに1件も届かなかったユーザーは、印を外して次の分に再試行する。届いた人の印は残す", async () => {
      const { db, tables, deleted } = fakeDb(baseTables());
      send.mockImplementation(async (subscription: { endpoint: string }) => {
        if (subscription.endpoint.includes("s-mom")) throw new Error("network down"); // 一時的な通信エラー
      });

      const result = await runReminders(db, send, NOW);

      expect(result.body).toEqual({ checked: 2, targeted: 2, sent: 1 });
      expect(markerUsers(tables)).toEqual(["dad"]);
      expect(deleted).toContainEqual({ table: "reminder_deliveries", filters: { sent_on: TODAY, user_id: ["mom"] } });
      // 通信エラーなので、購読は消さない。
      expect(deleted.some((d) => d.table === "push_subscriptions")).toBe(false);

      // 次の分: 印が外れた mom にだけ、もう一度送る。
      send.mockReset();
      send.mockResolvedValue(undefined);
      const retry = await runReminders(db, send, new Date(NOW.getTime() + 60_000));
      expect(retry.body).toEqual({ checked: 1, targeted: 1, sent: 2 });
      expect(sentEndpoints(send)).toEqual(["https://push.example/s-mom-1", "https://push.example/s-mom-2"]);
    });

    it("購読が複数あって1件でも届けば、印は残す(届かなかった購読があっても再送しない)", async () => {
      const { db, tables } = fakeDb(baseTables());
      send.mockImplementation(async (subscription: { endpoint: string }) => {
        if (subscription.endpoint.endsWith("s-mom-1")) throw new Error("network down");
      });

      const result = await runReminders(db, send, NOW);

      expect(result.body).toMatchObject({ sent: 2 });
      expect(markerUsers(tables)).toEqual(["dad", "mom"]);
    });

    it("購読が1件も無いユーザーは、送る先が無いので印を残す", async () => {
      const tables = baseTables();
      tables.push_subscriptions = [sub("s-dad", "dad")];
      const { db, tables: after } = fakeDb(tables);

      const result = await runReminders(db, send, NOW);

      expect(result.body).toEqual({ checked: 2, targeted: 2, sent: 1 });
      expect(markerUsers(after)).toEqual(["dad", "mom"]);
    });

    it("失効した購読(410 / 404)は削除する。それ以外のエラーの購読は残す", async () => {
      const { db, deleted, tables } = fakeDb(baseTables());
      send.mockImplementation(async (subscription: { endpoint: string }) => {
        if (subscription.endpoint.endsWith("s-mom-1")) throw Object.assign(new Error("gone"), { statusCode: 410 });
        if (subscription.endpoint.endsWith("s-mom-2")) throw Object.assign(new Error("not found"), { statusCode: 404 });
        if (subscription.endpoint.endsWith("s-dad")) throw Object.assign(new Error("server error"), { statusCode: 500 });
      });

      await runReminders(db, send, NOW);

      expect(deleted).toContainEqual({ table: "push_subscriptions", filters: { id: ["s-mom-1", "s-mom-2"] } });
      const remaining = tables.push_subscriptions!.map((row) => row.id).sort();
      expect(remaining).toEqual(["s-dad", "s-off"]);
    });

    it("全購読が失効していても、印は外れる(購読は削除されるので、次の分は送る先が無い)", async () => {
      const tables = baseTables();
      tables.push_subscriptions = [sub("s-mom-1", "mom")];
      tables.notification_settings = [setting("mom", "21:00")];
      const { db, tables: after } = fakeDb(tables);
      send.mockRejectedValue(Object.assign(new Error("gone"), { statusCode: 410 }));

      const first = await runReminders(db, send, NOW);
      expect(first.body).toEqual({ checked: 1, targeted: 1, sent: 0 });
      expect(markerUsers(after)).toEqual([]);
      expect(after.push_subscriptions).toEqual([]);

      // 次の分: 印を付け直すが、購読が無いので送らない。印は残る(再試行を繰り返さない)。
      const second = await runReminders(db, send, new Date(NOW.getTime() + 60_000));
      expect(second.body).toEqual({ checked: 1, targeted: 1, sent: 0 });
      expect(markerUsers(after)).toEqual(["mom"]);
    });
  });

  describe("DBの取得に失敗したとき", () => {
    it.each([
      ["notification_settings"],
      ["reminder_deliveries"],
      ["group_members"],
      ["records"],
      ["push_subscriptions"],
    ])("%s の取得に失敗したら、送らずに500を返す", async (failTable) => {
      const { db } = fakeDb(baseTables(), { failTables: [failTable] });

      const result = await runReminders(db, send, NOW);

      expect(result).toEqual({ status: 500, body: `failed to load ${failTable}` });
      expect(send).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });

    it("購読の取得に失敗したら、付けた印を外して次の分に再試行させる(印だけ残ると今日は届かない)", async () => {
      const { db, tables, deleted } = fakeDb(baseTables(), { failTables: ["push_subscriptions"] });

      await runReminders(db, send, NOW);

      expect(markerUsers(tables)).toEqual([]);
      expect(deleted).toContainEqual({
        table: "reminder_deliveries",
        filters: { sent_on: TODAY, user_id: ["mom", "dad"] },
      });
    });
  });
});
