import { describe, expect, it } from "vitest";
import { collectSaveWarnings } from "./saveChecks";

const base = { outcome: "smooth" as const, wakeTime: "06:59", departTime: "07:59" };

describe("collectSaveWarnings", () => {
  it("平日で起床・出発が入っていれば何も指摘しない", () => {
    expect(collectSaveWarnings({ ...base, date: "2026-10-14" })).toEqual([]);
  });

  it("日曜日は登校のない日として知らせる", () => {
    const w = collectSaveWarnings({ ...base, date: "2026-10-11" });
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("日曜日");
  });

  it("祝日は祝日名つきで知らせる(日曜の祝日は祝日の文言だけ)", () => {
    const w = collectSaveWarnings({ ...base, date: "2026-10-12" });
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("祝日");
    expect(w[0]).toContain("スポーツの日");
  });

  it("土曜日と平日は知らせない", () => {
    expect(collectSaveWarnings({ ...base, date: "2026-10-10" })).toEqual([]);
  });

  it("起床時刻・出発時刻の未入力を知らせる", () => {
    expect(collectSaveWarnings({ ...base, date: "2026-10-14", wakeTime: "", departTime: "" })).toEqual([
      "起床時刻が未入力です。",
      "出発時刻が未入力です。",
    ]);
  });

  it("行かなかった日は出発時刻の未入力を指摘しない", () => {
    expect(collectSaveWarnings({ ...base, date: "2026-10-14", outcome: "absent", departTime: "" })).toEqual([]);
  });

  it("休日の注意と未入力の指摘は一緒に返す", () => {
    const w = collectSaveWarnings({ ...base, date: "2026-10-11", wakeTime: "" });
    expect(w).toHaveLength(2);
  });
});
