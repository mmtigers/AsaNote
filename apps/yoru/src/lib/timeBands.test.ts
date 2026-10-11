import { describe, expect, it } from "vitest";
import { milestoneDisplay, milestoneWhen, normalizeMilestoneValue, toBandId } from "./timeBands";

describe("toBandId", () => {
  it("帯のidはそのまま", () => {
    expect(toBandId("bed", "mid")).toBe("mid");
  });

  it("旧い時刻は境界ごとに帯へ寄せる(境界の時刻は後ろの帯)", () => {
    expect(toBandId("arrive", "13:59")).toBe("early");
    expect(toBandId("arrive", "14:00")).toBe("mid");
    expect(toBandId("arrive", "15:00")).toBe("late");
    expect(toBandId("hwStart", "14:00")).toBe("early"); // 15時より前も最初の帯
    expect(toBandId("hwStart", "17:00")).toBe("mid");
    expect(toBandId("bath", "19:00")).toBe("late");
    expect(toBandId("bed", "19:59")).toBe("early");
    expect(toBandId("bed", "20:00")).toBe("mid");
    expect(toBandId("bed", "21:00")).toBe("late");
  });

  it("空や読めない値は null", () => {
    expect(toBandId("bed", undefined)).toBeNull();
    expect(toBandId("bed", "")).toBeNull();
    expect(toBandId("bed", "bad")).toBeNull();
  });
});

describe("milestoneWhen / milestoneDisplay / normalizeMilestoneValue", () => {
  it("帯は名前、「ほか」の時刻は「ごろ」付きで返す", () => {
    expect(milestoneWhen("bed", "mid")).toBe("20〜21時");
    expect(milestoneWhen("bed", "20:30")).toBe("20:30ごろ");
    expect(milestoneWhen("bed", "bad")).toBeNull();
  });

  it("一覧・CSV用は、帯なら名前、時刻はそのまま。夕食は時刻のまま", () => {
    expect(milestoneDisplay("hwStart", "early")).toBe("15〜17時");
    expect(milestoneDisplay("hwStart", "19:30")).toBe("19:30");
    expect(milestoneDisplay("dinner", "18:30")).toBe("18:30");
    expect(milestoneDisplay("bed", null)).toBe("");
  });

  it("帯のidと読める時刻は通し、読めない値は捨てる。夕食は時刻のまま", () => {
    expect(normalizeMilestoneValue("bed", "20:30")).toBe("20:30");
    expect(normalizeMilestoneValue("bed", "mid")).toBe("mid");
    expect(normalizeMilestoneValue("bed", "ng")).toBeNull();
    expect(normalizeMilestoneValue("dinner", "18:00")).toBe("18:00");
    expect(normalizeMilestoneValue("bed", null)).toBeNull();
  });
});
