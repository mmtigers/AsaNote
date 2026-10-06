import { describe, expect, it } from "vitest";
import {
  averageBedtimeByOutcome,
  bedtimeTrend,
  countOutcomes,
  countTags,
  formatMinutes,
  outcomeByDate,
  outcomeByFriendPromise,
  outcomeByHomeworkStart,
  recordsForFriendPromise,
  recordsForHomeworkStart,
  recordsForOutcome,
  recordsForResponseTag,
  recordsForTag,
  responseEffectStats,
  roughRate,
  type AggregatableRecord,
} from "./aggregate";

function rec(over: Partial<AggregatableRecord> = {}): AggregatableRecord {
  return {
    recordDate: "2026-10-01",
    updatedAt: "2026-10-01T12:00:00Z",
    outcome: "calm",
    times: {},
    friend: [],
    trigger: [],
    response: [],
    responseEffect: null,
    ...over,
  };
}

describe("outcomeByDate", () => {
  it("同じ日は最終更新が新しい方を採用し、様子が未選択の記録は無視する", () => {
    const map = outcomeByDate([
      rec({ outcome: "calm", updatedAt: "2026-10-01T10:00:00Z" }),
      rec({ outcome: "storm", updatedAt: "2026-10-01T11:00:00Z" }),
      rec({ recordDate: "2026-10-02", outcome: null }),
    ]);
    expect(map.get("2026-10-01")).toBe("storm");
    expect(map.has("2026-10-02")).toBe(false);
  });
});

describe("countOutcomes / roughRate", () => {
  it("様子ごとに数え、荒れた割合は少し荒れた+大荒れ", () => {
    const { total, counts } = countOutcomes([
      rec({ outcome: "calm" }),
      rec({ outcome: "rough" }),
      rec({ outcome: "storm" }),
      rec({ outcome: "calm" }),
      rec({ outcome: null }),
    ]);
    expect(total).toBe(4);
    expect(counts).toEqual({ calm: 2, rough: 1, storm: 1 });
    expect(roughRate(counts)).toBe(50);
    expect(roughRate({ calm: 0, rough: 0, storm: 0 })).toBe(0);
  });
});

describe("outcomeByHomeworkStart", () => {
  it("区分ごとに様子を数え、記録の無い区分と時刻未入力は省く", () => {
    const buckets = outcomeByHomeworkStart([
      rec({ times: { hwStart: "15:30" }, outcome: "calm" }),
      rec({ times: { hwStart: "16:00" }, outcome: "rough" }),
      rec({ times: { hwStart: "16:59" }, outcome: "storm" }),
      rec({ times: { hwStart: "18:30" }, outcome: "storm" }),
      rec({ times: {}, outcome: "storm" }),
      rec({ times: { hwStart: "bad" }, outcome: "storm" }),
    ]);
    expect(buckets.map((b) => [b.key, b.total, b.roughRate])).toEqual([
      ["early", 1, 0],
      ["mid", 2, 100],
      ["later", 1, 100],
    ]);
  });
});

describe("outcomeByFriendPromise", () => {
  it("約束あり/なしで分け、両方あれば約束ありを優先する", () => {
    const buckets = outcomeByFriendPromise([
      rec({ friend: ["約束あり"], outcome: "rough" }),
      rec({ friend: ["約束あり", "約束なし"], outcome: "calm" }),
      rec({ friend: ["約束なし"], outcome: "calm" }),
      rec({ friend: ["家に来た"], outcome: "storm" }),
    ]);
    expect(buckets.map((b) => [b.key, b.total, b.roughRate])).toEqual([
      ["with", 2, 50],
      ["without", 1, 0],
    ]);
  });
});

describe("消灯時刻", () => {
  it("様子ごとの平均消灯時刻", () => {
    const avg = averageBedtimeByOutcome([
      rec({ times: { bed: "20:00" }, outcome: "calm" }),
      rec({ times: { bed: "20:30" }, outcome: "calm" }),
      rec({ times: { bed: "21:30" }, outcome: "storm" }),
      rec({ times: {}, outcome: "rough" }),
    ]);
    expect(avg).toEqual([
      { outcome: "calm", count: 2, averageMinutes: 20 * 60 + 15 },
      { outcome: "storm", count: 1, averageMinutes: 21 * 60 + 30 },
    ]);
    expect(formatMinutes(20 * 60 + 15)).toBe("20:15");
  });

  it("推移は日付の古い順で直近limit件、同日は新しい更新を採用", () => {
    const points = bedtimeTrend(
      [
        rec({ recordDate: "2026-10-03", times: { bed: "21:00" } }),
        rec({ recordDate: "2026-10-01", times: { bed: "20:00" } }),
        rec({ recordDate: "2026-10-02", times: { bed: "20:30" }, updatedAt: "2026-10-02T01:00:00Z" }),
        rec({ recordDate: "2026-10-02", times: { bed: "22:00" }, updatedAt: "2026-10-02T02:00:00Z" }),
      ],
      2
    );
    expect(points.map((p) => [p.date, p.minutes])).toEqual([
      ["2026-10-02", 22 * 60],
      ["2026-10-03", 21 * 60],
    ]);
  });
});

describe("countTags / responseEffectStats", () => {
  it("タグを回数順(同数は名前順)に数え、同一記録内の重複は1回", () => {
    const tags = countTags(
      [rec({ trigger: ["宿題", "宿題", "食事"] }), rec({ trigger: ["食事"] }), rec({ trigger: ["眠い・疲れ"] })],
      (r) => r.trigger
    );
    expect(tags.map((t) => [t.tag, t.count])).toEqual([
      ["食事", 2],
      ["宿題", 1],
      ["眠い・疲れ", 1],
    ]);
  });

  it("対応タグごとの効き具合。効き具合が未入力の記録は対象外", () => {
    const stats = responseEffectStats([
      rec({ response: ["時間を宣言", "放置"], responseEffect: "good" }),
      rec({ response: ["時間を宣言"], responseEffect: "bad" }),
      rec({ response: ["放置"], responseEffect: null }),
    ]);
    expect(stats).toEqual([
      { tag: "時間を宣言", total: 2, effects: { good: 1, mid: 0, bad: 1 } },
      { tag: "放置", total: 1, effects: { good: 1, mid: 0, bad: 0 } },
    ]);
  });
});

describe("詳細表示用の recordsFor*(集計の件数と一覧がずれない)", () => {
  const data = [
    rec({ recordDate: "2026-10-01", outcome: "calm", times: { hwStart: "15:30" }, friend: ["約束あり"] }),
    rec({ recordDate: "2026-10-03", outcome: "storm", times: { hwStart: "16:30" }, friend: ["約束なし"], trigger: ["宿題"], response: ["見守る"], responseEffect: "good" }),
    rec({ recordDate: "2026-10-02", outcome: "rough", times: { hwStart: "16:10" }, friend: ["約束あり", "約束なし"], trigger: ["宿題", "空腹"], response: ["見守る"], responseEffect: null }),
    rec({ recordDate: "2026-10-04", outcome: null, times: { hwStart: "16:10" }, friend: ["約束あり"] }),
  ];

  it("様子で絞り、新しい日付から返す", () => {
    expect(recordsForOutcome(data, "storm").map((r) => r.recordDate)).toEqual(["2026-10-03"]);
    expect(recordsForOutcome(data, "calm")).toHaveLength(countOutcomes(data).counts.calm);
  });

  it("宿題開始の区分は集計と同じ件数になる(様子が未入力の記録は含めない)", () => {
    for (const b of outcomeByHomeworkStart(data)) {
      expect(recordsForHomeworkStart(data, b.key)).toHaveLength(b.total);
    }
    expect(recordsForHomeworkStart(data, "mid").map((r) => r.recordDate)).toEqual(["2026-10-03", "2026-10-02"]);
    expect(recordsForHomeworkStart(data, "unknown")).toEqual([]);
  });

  it("友達との約束は集計と同じ件数になり、両方付いていれば「約束あり」側", () => {
    for (const b of outcomeByFriendPromise(data)) {
      expect(recordsForFriendPromise(data, b.key)).toHaveLength(b.total);
    }
    expect(recordsForFriendPromise(data, "with").map((r) => r.recordDate)).toEqual(["2026-10-02", "2026-10-01"]);
  });

  it("タグで絞る", () => {
    expect(recordsForTag(data, (r) => r.trigger, "宿題").map((r) => r.recordDate)).toEqual(["2026-10-03", "2026-10-02"]);
  });

  it("対応タグは効き具合が入力された記録だけ(responseEffectStatsと同じ)", () => {
    const stat = responseEffectStats(data).find((s) => s.tag === "見守る");
    expect(recordsForResponseTag(data, "見守る")).toHaveLength(stat?.total ?? -1);
  });
});
