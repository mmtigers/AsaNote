// @vitest-environment node
import { describe, expect, it } from "vitest";
import { autoDueDate, dueAt, jstParts, periodsFor, upcomingDueDate } from "./liaisonSchedule.ts";

// 2026-11-12 は木曜日(weekday=4)。
const THU = 4;
const at = (iso: string) => new Date(iso);

describe("jstParts", () => {
  it("UTC を日本時間の日付・曜日・時にする(日付をまたぐ)", () => {
    expect(jstParts(at("2026-11-11T15:30:00Z"))).toEqual({ date: "2026-11-12", weekday: THU, hour: 0 });
  });
});

describe("autoDueDate(自動作成の判定)", () => {
  it("予定の時刻ちょうどから拾う", () => {
    expect(autoDueDate(at("2026-11-12T04:00:00Z"), THU, 13)).toBe("2026-11-12"); // 13:00 JST
  });
  it("予定の時刻より前は拾わない", () => {
    expect(autoDueDate(at("2026-11-12T03:59:00Z"), THU, 13)).toBeNull();
  });
  it("3時間を過ぎたら拾わない", () => {
    expect(autoDueDate(at("2026-11-12T06:59:00Z"), THU, 13)).toBe("2026-11-12");
    expect(autoDueDate(at("2026-11-12T07:00:00Z"), THU, 13)).toBeNull();
  });
  it("曜日が違えば拾わない", () => {
    expect(autoDueDate(at("2026-11-12T04:00:00Z"), 3, 13)).toBeNull();
  });
  it("23時の設定は、日付をまたいだ翌日の 1時台も前日の回として拾う", () => {
    expect(autoDueDate(at("2026-11-12T16:30:00Z"), THU, 23)).toBe("2026-11-12"); // 11/13 1:30 JST
  });
});

describe("upcomingDueDate(今すぐ作るの回)", () => {
  it("今日が予定の曜日なら今日", () => {
    expect(upcomingDueDate(at("2026-11-12T10:00:00Z"), THU)).toBe("2026-11-12");
  });
  it("火曜なら、その週の木曜", () => {
    expect(upcomingDueDate(at("2026-11-10T03:00:00Z"), THU)).toBe("2026-11-12");
  });
  it("金曜なら、翌週の木曜", () => {
    expect(upcomingDueDate(at("2026-11-13T03:00:00Z"), THU)).toBe("2026-11-19");
  });
});

describe("dueAt", () => {
  it("予定日の時刻(日本時間)を UTC の Date にする", () => {
    expect(dueAt("2026-11-12", 13).toISOString()).toBe("2026-11-12T04:00:00.000Z");
  });
});

describe("periodsFor(対象期間)", () => {
  it("あさは X-6〜X、よるは X-7〜X-1", () => {
    expect(periodsFor("2026-11-12")).toEqual({
      asaFrom: "2026-11-06",
      asaTo: "2026-11-12",
      yoruFrom: "2026-11-05",
      yoruTo: "2026-11-11",
    });
  });
  it("翌週の回と、期間が重ならず抜けもない", () => {
    const thisWeek = periodsFor("2026-11-12");
    const nextWeek = periodsFor("2026-11-19");
    expect(nextWeek.asaFrom).toBe("2026-11-13");
    expect(nextWeek.yoruFrom).toBe("2026-11-12");
    expect(thisWeek.yoruTo).toBe("2026-11-11");
  });
});
