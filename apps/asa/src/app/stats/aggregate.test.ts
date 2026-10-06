/**
 * Issue #4: 傾向タブのカレンダー色分け・曜日別・起床時刻別の集計。
 *
 * この種の集計は間違っていても画面はエラーにならず、ただ静かに違う数字を出す。
 * 曜日のズレ(UTC解釈による1日ズレ)とバケットの境界値を特に固定しておく。
 */
import { describe, expect, it } from "vitest";
import { WAKE_SLOTS } from "@/lib/wakeTime";
import type { AggregatableRecord } from "./aggregate";
import {
  outcomeByDate,
  recordsForWakeTimeBucket,
  recordsForWeekday,
  smoothRateByWakeTime,
  smoothRateByWeekday,
} from "./aggregate";

function record(partial: Partial<AggregatableRecord> & { recordDate: string }): AggregatableRecord {
  return {
    updatedAt: "2026-09-14T08:00:00.000Z",
    outcome: "smooth",
    wakeTime: null,
    ...partial,
  };
}

describe("outcomeByDate", () => {
  it("日付ごとの結果を返す", () => {
    const map = outcomeByDate([
      record({ recordDate: "2026-09-14", outcome: "smooth" }),
      record({ recordDate: "2026-09-15", outcome: "reluctant" }),
    ]);

    expect(map.get("2026-09-14")).toBe("smooth");
    expect(map.get("2026-09-15")).toBe("reluctant");
  });

  it("同じ日に複数件あれば最終更新が新しい方を採用する(並び順に依存しない)", () => {
    const older = record({
      recordDate: "2026-09-14",
      outcome: "smooth",
      updatedAt: "2026-09-14T07:00:00.000Z",
    });
    const newer = record({
      recordDate: "2026-09-14",
      outcome: "absent",
      updatedAt: "2026-09-14T09:00:00.000Z",
    });

    expect(outcomeByDate([older, newer]).get("2026-09-14")).toBe("absent");
    expect(outcomeByDate([newer, older]).get("2026-09-14")).toBe("absent");
  });

  it("結果が未選択の記録は色を付けない(キーごと持たない)", () => {
    const map = outcomeByDate([
      record({ recordDate: "2026-09-14", outcome: null }),
      record({ recordDate: "2026-09-15", outcome: undefined }),
    ]);

    expect(map.size).toBe(0);
  });
});

describe("smoothRateByWeekday", () => {
  it("記録の曜日を日本時間で判定する(UTC解釈による1日ズレを起こさない)", () => {
    // 2026-09-14は月曜。UTC解釈されると日曜に寄ってしまう。
    const stats = smoothRateByWeekday([record({ recordDate: "2026-09-14" })]);

    expect(stats).toHaveLength(1);
    expect(stats[0]?.label).toBe("月");
  });

  it("曜日ごとにスムーズ率を出す(四捨五入)", () => {
    const stats = smoothRateByWeekday([
      record({ recordDate: "2026-09-14", outcome: "smooth" }), // 月
      record({ recordDate: "2026-09-21", outcome: "reluctant" }), // 月
      record({ recordDate: "2026-09-28", outcome: "absent" }), // 月
      record({ recordDate: "2026-09-15", outcome: "smooth" }), // 火
    ]);

    const monday = stats.find((s) => s.label === "月");
    expect(monday).toMatchObject({ total: 3, smooth: 1, rate: 33 });
    expect(stats.find((s) => s.label === "火")).toMatchObject({ total: 1, smooth: 1, rate: 100 });
  });

  it("記録が1件も無い曜日は行ごと省き、日→土の順で返す", () => {
    const stats = smoothRateByWeekday([
      record({ recordDate: "2026-09-15" }), // 火
      record({ recordDate: "2026-09-14" }), // 月
    ]);

    expect(stats.map((s) => s.label)).toEqual(["月", "火"]);
  });

  it("結果が未選択の記録は数えない", () => {
    expect(smoothRateByWeekday([record({ recordDate: "2026-09-14", outcome: null })])).toEqual([]);
  });
});

describe("smoothRateByWakeTime", () => {
  it("記録画面の3区分の境界で振り分ける(上限はその値を含まない)", () => {
    const stats = smoothRateByWakeTime([
      record({ recordDate: "2026-09-01", wakeTime: "06:29" }),
      record({ recordDate: "2026-09-02", wakeTime: "06:59" }),
      record({ recordDate: "2026-09-03", wakeTime: "07:00" }),
      record({ recordDate: "2026-09-04", wakeTime: "07:14" }),
      record({ recordDate: "2026-09-05", wakeTime: "07:15" }),
      record({ recordDate: "2026-09-07", wakeTime: "07:45" }),
    ]);

    expect(stats.map((s) => [s.label, s.total])).toEqual([
      ["7時より前", 2],
      ["7時〜7時15分", 2],
      ["7時15分〜", 2],
    ]);
  });

  it("記録画面で保存される代表値は、選んだ区分にそのまま集計される", () => {
    const stats = smoothRateByWakeTime(
      WAKE_SLOTS.map((slot, i) => record({ recordDate: `2026-09-0${i + 1}`, wakeTime: slot.value }))
    );
    expect(stats.map((s) => [s.label, s.total])).toEqual(WAKE_SLOTS.map((slot) => [slot.label, 1]));
  });

  it("時間帯ごとのスムーズ率を出す", () => {
    const stats = smoothRateByWakeTime([
      record({ recordDate: "2026-09-01", wakeTime: "06:00", outcome: "smooth" }),
      record({ recordDate: "2026-09-02", wakeTime: "06:10", outcome: "smooth" }),
      record({ recordDate: "2026-09-03", wakeTime: "06:20", outcome: "reluctant" }),
    ]);

    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ label: "7時より前", total: 3, smooth: 2, rate: 67 });
  });

  it("起床時刻が未入力・壊れている記録は数えない", () => {
    expect(
      smoothRateByWakeTime([
        record({ recordDate: "2026-09-01", wakeTime: null }),
        record({ recordDate: "2026-09-02", wakeTime: "あさ" }),
        record({ recordDate: "2026-09-03", wakeTime: "06:00", outcome: null }),
      ])
    ).toEqual([]);
  });
});

describe("recordsForWeekday", () => {
  it("指定した曜日(index)の記録だけを返す(#3-3の詳細表示)", () => {
    const monday = record({ recordDate: "2026-09-14" }); // 月
    const tuesday = record({ recordDate: "2026-09-15" }); // 火
    expect(recordsForWeekday([monday, tuesday], "1")).toEqual([monday]);
  });

  it("結果が未選択の記録は含めない(集計側と条件を揃える)", () => {
    const record1 = record({ recordDate: "2026-09-14", outcome: null }); // 月
    expect(recordsForWeekday([record1], "1")).toEqual([]);
  });
});

describe("recordsForWakeTimeBucket", () => {
  it("指定した時間帯バケットの記録だけを返す(#3-3の詳細表示)", () => {
    const early = record({ recordDate: "2026-09-01", wakeTime: "06:20" });
    const late = record({ recordDate: "2026-09-02", wakeTime: "07:40" });
    expect(recordsForWakeTimeBucket([early, late], "before-0700")).toEqual([early]);
  });

  it("smoothRateByWakeTimeと同じ境界値で振り分ける", () => {
    const boundary = record({ recordDate: "2026-09-01", wakeTime: "07:00" });
    expect(recordsForWakeTimeBucket([boundary], "before-0700")).toEqual([]);
    expect(recordsForWakeTimeBucket([boundary], "0700-0715")).toEqual([boundary]);
  });
});
