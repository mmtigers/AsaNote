import { describe, expect, it } from "vitest";
import type { MorningRecord } from "@/lib/db/morning";
import type { AggregatableRecord } from "./aggregate";
import { morningByBedtime, morningByNightOutcome, pairNightWithNextMorning } from "./morning";

function night(
  recordDate: string,
  outcome: AggregatableRecord["outcome"],
  bed: string | undefined,
  childId: string | null = null
): AggregatableRecord & { childId: string | null } {
  return {
    recordDate,
    updatedAt: `${recordDate}T21:00:00Z`,
    outcome,
    times: bed ? { bed } : {},
    friend: [],
    trigger: [],
    response: [],
    responseEffect: null,
    childId,
  };
}

function morning(
  recordDate: string,
  outcome: MorningRecord["outcome"],
  wakeTime: string | null = null,
  childId: string | null = null,
  updatedAt = `${recordDate}T08:00:00Z`
): MorningRecord {
  return { recordDate, childId, outcome, wakeTime, updatedAt };
}

describe("pairNightWithNextMorning", () => {
  it("同じ子どもの翌日の朝だけを組にする", () => {
    const pairs = pairNightWithNextMorning(
      [night("2026-10-01", "calm", "20:00", "c1"), night("2026-10-02", "calm", "20:00", "c1")],
      [morning("2026-10-02", "smooth", null, "c1"), morning("2026-10-02", "reluctant", null, "c2"), morning("2026-10-05", "smooth", null, "c1")]
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.night.recordDate).toBe("2026-10-01");
    expect(pairs[0]?.morning.outcome).toBe("smooth");
  });

  it("子ども未設定どうしも結び、月またぎでも翌日を引く", () => {
    const pairs = pairNightWithNextMorning([night("2026-09-30", "calm", "21:00")], [morning("2026-10-01", "absent")]);
    expect(pairs).toHaveLength(1);
  });

  it("朝の記録が複数あれば最終更新が新しい方", () => {
    const pairs = pairNightWithNextMorning(
      [night("2026-10-01", "calm", "21:00")],
      [morning("2026-10-02", "smooth", null, null, "2026-10-02T07:00:00Z"), morning("2026-10-02", "reluctant", null, null, "2026-10-02T09:00:00Z")]
    );
    expect(pairs[0]?.morning.outcome).toBe("reluctant");
  });
});

describe("morningByBedtime", () => {
  const pairs = pairNightWithNextMorning(
    [
      night("2026-10-01", "calm", "20:00"),
      night("2026-10-02", "calm", "20:15"),
      night("2026-10-03", "rough", "21:45"),
      night("2026-10-04", "rough", "21:50"),
      night("2026-10-05", "rough", undefined),
    ],
    [
      morning("2026-10-02", "smooth", "06:30"),
      morning("2026-10-03", "smooth", "06:40"),
      morning("2026-10-04", "reluctant", "07:10"),
      morning("2026-10-05", "absent", null),
      morning("2026-10-06", "absent", "07:30"),
    ]
  );

  it("消灯時刻の区分ごとに翌朝の内訳・行き渋り率・平均起床を出す", () => {
    const buckets = morningByBedtime(pairs);
    expect(buckets.map((b) => b.key)).toEqual(["early", "later"]);
    const early = buckets[0]!;
    expect(early.total).toBe(2);
    expect(early.counts).toEqual({ smooth: 2, reluctant: 0, absent: 0 });
    expect(early.strugglingRate).toBe(0);
    expect(early.averageWakeMinutes).toBe(6 * 60 + 35);
    const later = buckets[1]!;
    expect(later.total).toBe(2);
    expect(later.strugglingRate).toBe(100);
    expect(later.counts).toMatchObject({ smooth: 0, reluctant: 1, absent: 1 });
  });

  it("消灯時刻が無い夜は除外する", () => {
    expect(morningByBedtime(pairs).reduce((n, b) => n + b.total, 0)).toBe(4);
  });
});

describe("morningByNightOutcome", () => {
  it("夜の様子ごとに翌朝を集計し、組の無い様子は省く", () => {
    const pairs = pairNightWithNextMorning(
      [night("2026-10-01", "calm", "20:00"), night("2026-10-02", "rough", "21:00")],
      [morning("2026-10-02", "smooth"), morning("2026-10-03", "reluctant")]
    );
    const out = morningByNightOutcome(pairs, [
      { value: "calm", label: "穏やか" },
      { value: "rough", label: "少し荒れた" },
      { value: "storm", label: "大荒れ" },
    ]);
    expect(out.map((b) => [b.key, b.strugglingRate])).toEqual([
      ["calm", 0],
      ["rough", 100],
    ]);
  });

  it("朝の結果が未入力の組は件数に入れない", () => {
    const pairs = pairNightWithNextMorning([night("2026-10-01", "calm", "20:00")], [morning("2026-10-02", null, "06:30")]);
    const [b] = morningByNightOutcome(pairs, [{ value: "calm", label: "穏やか" }]);
    expect(b?.total).toBe(0);
    expect(b?.averageWakeMinutes).toBe(6 * 60 + 30);
  });
});
