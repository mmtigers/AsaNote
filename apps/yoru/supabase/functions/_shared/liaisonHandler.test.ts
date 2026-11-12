// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ClaimCondition,
  type Generate,
  type LiaisonSettings,
  type LiaisonStore,
  type MemoPatch,
  type MemoRow,
  runAuto,
  runManual,
} from "./liaisonHandler.ts";

type Row = Record<string, unknown>;
type Memo = MemoRow & Row;

// 2026-11-12(木)13:00 JST。
const NOW = new Date("2026-11-12T04:00:00Z");
const PARENT_A = "uA";
const PARENT_B = "uB";
const STRANGER = "uX";

function makeStore() {
  const memos: Memo[] = [];
  let seq = 0;
  const state = {
    memos,
    settings: [
      {
        child_id: "c1",
        enabled: true,
        consented_at: "2026-11-01T00:00:00Z",
        weekday: 4,
        hour: 13,
        target_chars: 80,
        recipient_label: "療育先",
        include_memo: true,
        style_examples: [],
      },
    ] as LiaisonSettings[],
    children: [{ id: "c1", name: "ともや", created_by: PARENT_A }],
    family: [PARENT_A, PARENT_B],
    asa: [
      { user_id: PARENT_A, child_id: null, record_date: "2026-11-10", outcome: "reluctant", memo: "ともやが遅刻" },
      { user_id: PARENT_A, child_id: null, record_date: "2026-11-01", outcome: "smooth" }, // 期間外
    ] as Row[],
    yoru: [{ user_id: PARENT_B, child_id: "c1", record_date: "2026-11-11", outcome: "calm" }] as Row[],
    subscriptions: [
      { id: "s1", user_id: PARENT_A, endpoint: "e1", p256dh: "p", auth_key: "a" },
      { id: "s2", user_id: PARENT_B, endpoint: "e2", p256dh: "p", auth_key: "a" },
    ],
    deletedSubscriptions: [] as string[],
    sent: [] as string[],
  };

  const inRange = (r: Row, from: string, to: string) => String(r.record_date) >= from && String(r.record_date) <= to;
  const store: LiaisonStore = {
    listEnabledSettings: async () => state.settings.filter((s) => s.enabled),
    getSettings: async (childId) => state.settings.find((s) => s.child_id === childId) ?? null,
    getChild: async (childId) => state.children.find((c) => c.id === childId) ?? null,
    familyOf: async (userId) => (state.family.includes(userId) ? state.family : [userId]),
    childrenCreatedBy: async (userIds) => state.children.filter((c) => userIds.includes(c.created_by)),
    getMemo: async (childId, dueDate) => memos.find((m) => m.child_id === childId && m.due_date === dueDate) ?? null,
    insertMemo: async (row) => {
      if (memos.some((m) => m.child_id === row.child_id && m.due_date === row.due_date)) return null;
      const memo = { id: `m${++seq}`, status: "generating", attempts: 0, locked_at: null, regenerate_count: 0, ...row } as Memo;
      memos.push(memo);
      return { ...memo };
    },
    claimMemo: async (id: string, condition: ClaimCondition, patch: MemoPatch) => {
      const memo = memos.find((m) => m.id === id);
      if (!memo) return null;
      const stale = memo.status === "generating" && (memo.locked_at ?? "") < condition.staleBefore;
      const ok =
        condition.kind === "auto"
          ? memo.attempts < condition.maxAttempts && (memo.status === "failed" || stale)
          : memo.regenerate_count === condition.regenerateCount && (memo.status !== "generating" || stale);
      if (!ok) return null;
      Object.assign(memo, patch);
      return { ...memo };
    },
    updateMemo: async (id, patch) => {
      Object.assign(memos.find((m) => m.id === id) ?? {}, patch);
    },
    asaRecords: async (userIds, from, to) => state.asa.filter((r) => userIds.includes(String(r.user_id)) && inRange(r, from, to)),
    yoruRecords: async (userIds, from, to) => state.yoru.filter((r) => userIds.includes(String(r.user_id)) && inRange(r, from, to)),
    rules: async () => [],
    openConcerns: async () => [{ title: "運動会の音が苦手" }],
    sentTexts: async () => state.sent,
    subscriptionsFor: async (userIds) => state.subscriptions.filter((s) => userIds.includes(s.user_id)),
    deleteSubscriptions: async (ids) => {
      state.deletedSubscriptions.push(...ids);
    },
  };
  return { store, state };
}

const draft = (memo = "あ".repeat(80), contact = "") => ({ output: { memo, contact }, model: "test-model" });

describe("runAuto(cron)", () => {
  let env: ReturnType<typeof makeStore>;
  let generate: ReturnType<typeof vi.fn<Generate>>;
  let send: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    env = makeStore();
    generate = vi.fn<Generate>().mockResolvedValue(draft());
    send = vi.fn().mockResolvedValue(undefined);
  });

  it("予定の時刻に、下書きを作って保存し、家族の購読へ通知する", async () => {
    const result = await runAuto({ store: env.store, generate, send }, NOW);
    expect(result).toMatchObject({ due: 1, generated: 1, notified: 2 });
    const memo = env.state.memos[0];
    expect(memo).toMatchObject({
      due_date: "2026-11-12",
      status: "generated",
      draft_text: "あ".repeat(80),
      contact_draft_text: null,
      model: "test-model",
      locked_at: null,
      attempts: 1,
      asa_from: "2026-11-06",
      yoru_to: "2026-11-11",
    });
    expect(JSON.parse(send.mock.calls[0]?.[1] as string)).toMatchObject({ url: "/memo" });
  });

  it("AI には名前を伏せた記録を渡し、期間外の記録は渡さない。子どもが1人なら未分類と検討事項も使う", async () => {
    await runAuto({ store: env.store, generate, send }, NOW);
    const content = generate.mock.calls[0]?.[0].messages[0]?.content ?? "";
    expect(content).toContain("本人が遅刻");
    expect(content).not.toContain("ともや");
    expect(content).not.toContain("2026-11-01");
    expect(content).toContain("運動会の音が苦手");
  });

  it("子どもが2人以上なら、未分類の記録と検討事項は使わない", async () => {
    env.state.children.push({ id: "c2", name: "はる", created_by: PARENT_B });
    await runAuto({ store: env.store, generate, send }, NOW);
    const content = generate.mock.calls[0]?.[0].messages[0]?.content ?? "";
    expect(content).not.toContain("遅刻");
    expect(content).not.toContain("運動会");
  });

  it("2回目の呼び出しでは、作成済みの回を作り直さない", async () => {
    await runAuto({ store: env.store, generate, send }, NOW);
    const again = await runAuto({ store: env.store, generate, send }, new Date(NOW.getTime() + 10 * 60 * 1000));
    expect(again.due).toBe(0);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("予定の時刻の前・同意の無い設定は対象外", async () => {
    expect((await runAuto({ store: env.store, generate, send }, new Date("2026-11-12T03:59:00Z"))).due).toBe(0);
    env.state.settings[0]!.consented_at = null;
    expect((await runAuto({ store: env.store, generate, send }, NOW)).due).toBe(0);
  });

  it("記録が無ければ AI を呼ばず「記録なし」にし、通知しない", async () => {
    env.state.asa = [];
    env.state.yoru = [];
    const result = await runAuto({ store: env.store, generate, send }, NOW);
    expect(result).toMatchObject({ no_records: 1, notified: 0 });
    expect(generate).not.toHaveBeenCalled();
    expect(env.state.memos[0]?.status).toBe("no_records");
  });

  it("文字数が外れたら1回だけ直してもらう", async () => {
    generate.mockResolvedValueOnce(draft("あ".repeat(150))).mockResolvedValueOnce(draft("い".repeat(80)));
    await runAuto({ store: env.store, generate, send }, NOW);
    expect(generate).toHaveBeenCalledTimes(2);
    const second = generate.mock.calls[1]?.[0].messages ?? [];
    expect(second.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(env.state.memos[0]?.draft_text).toBe("い".repeat(80));
  });

  it("失敗したら failed にし、次の呼び出しで再試行する(上限3回)", async () => {
    generate.mockRejectedValue(new Error("boom"));
    const first = await runAuto({ store: env.store, generate, send }, NOW);
    expect(first.failed).toBe(1);
    expect(env.state.memos[0]).toMatchObject({ status: "failed", attempts: 1, locked_at: null });
    expect(env.state.memos[0]?.error).not.toContain("boom");

    await runAuto({ store: env.store, generate, send }, new Date(NOW.getTime() + 10 * 60 * 1000));
    await runAuto({ store: env.store, generate, send }, new Date(NOW.getTime() + 20 * 60 * 1000));
    expect(env.state.memos[0]?.attempts).toBe(3);
    const fourth = await runAuto({ store: env.store, generate, send }, new Date(NOW.getTime() + 30 * 60 * 1000));
    expect(fourth.due).toBe(0);
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("失効した購読は消す", async () => {
    send.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));
    await runAuto({ store: env.store, generate, send }, NOW);
    expect(env.state.deletedSubscriptions).toHaveLength(1);
  });
});

describe("runManual(今すぐ作る・作り直す)", () => {
  let env: ReturnType<typeof makeStore>;
  let generate: ReturnType<typeof vi.fn<Generate>>;
  const send = vi.fn();
  // 火曜日。今の回は木曜(11/12)。
  const TUE = new Date("2026-11-10T03:00:00Z");
  beforeEach(() => {
    env = makeStore();
    generate = vi.fn<Generate>().mockResolvedValue(draft());
  });

  it("今の回の下書きを作る(通知はしない)。回数を数える", async () => {
    expect(await runManual({ store: env.store, generate, send }, TUE, PARENT_B, "c1", null)).toEqual({ ok: true, status: "generated" });
    expect(env.state.memos[0]).toMatchObject({ due_date: "2026-11-12", regenerate_count: 1, status: "generated" });
    expect(send).not.toHaveBeenCalled();
  });

  it("作り直しは、追加の希望を渡し、3回までに制限する", async () => {
    await runManual({ store: env.store, generate, send }, TUE, PARENT_A, "c1", null);
    await runManual({ store: env.store, generate, send }, TUE, PARENT_A, "c1", " もっと短く ");
    expect(generate.mock.calls[1]?.[0].messages[0]?.content).toContain("今回の追加の希望: もっと短く");
    await runManual({ store: env.store, generate, send }, TUE, PARENT_A, "c1", null);
    expect(await runManual({ store: env.store, generate, send }, TUE, PARENT_A, "c1", null)).toMatchObject({ ok: false, code: "limit" });
    expect(env.state.memos[0]?.regenerate_count).toBe(3);
  });

  it("作り直しで、前の編集を消す", async () => {
    await runManual({ store: env.store, generate, send }, TUE, PARENT_A, "c1", null);
    env.state.memos[0]!.edited_text = "編集";
    await runManual({ store: env.store, generate, send }, TUE, PARENT_A, "c1", null);
    expect(env.state.memos[0]?.edited_text).toBeNull();
  });

  it("作成中の回は、重ねて作らない", async () => {
    await runManual({ store: env.store, generate, send }, TUE, PARENT_A, "c1", null);
    Object.assign(env.state.memos[0]!, { status: "generating", locked_at: TUE.toISOString() });
    expect(await runManual({ store: env.store, generate, send }, TUE, PARENT_A, "c1", null)).toMatchObject({ ok: false, code: "busy" });
  });

  it("子どもが見えない人・設定がオフの子は作れない", async () => {
    expect(await runManual({ store: env.store, generate, send }, TUE, STRANGER, "c1", null)).toMatchObject({ ok: false, code: "not_found" });
    env.state.settings[0]!.enabled = false;
    expect(await runManual({ store: env.store, generate, send }, TUE, PARENT_A, "c1", null)).toMatchObject({ ok: false, code: "not_enabled" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("AI の失敗は、内部の情報を出さずに伝える", async () => {
    generate.mockRejectedValue(new Error("secret detail"));
    const result = await runManual({ store: env.store, generate, send }, TUE, PARENT_A, "c1", null);
    expect(result).toMatchObject({ ok: false, code: "failed" });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
