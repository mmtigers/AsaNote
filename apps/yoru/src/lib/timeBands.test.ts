import { describe, expect, it } from "vitest";
import { bandLabel, milestoneDisplay, normalizeMilestoneValue, toBandId } from "./timeBands";

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

describe("bandLabel / milestoneDisplay / normalizeMilestoneValue", () => {
  it("帯の名前を返し、夕食は時刻のまま", () => {
    expect(bandLabel("bed", "mid")).toBe("20〜21時");
    expect(milestoneDisplay("hwStart", "19:30")).toBe("19時以降");
    expect(milestoneDisplay("dinner", "18:30")).toBe("18:30");
    expect(milestoneDisplay("bed", null)).toBe("");
  });

  it("保存用の値は帯のid、夕食は時刻のまま", () => {
    expect(normalizeMilestoneValue("bed", "20:30")).toBe("mid");
    expect(normalizeMilestoneValue("dinner", "18:00")).toBe("18:00");
    expect(normalizeMilestoneValue("bed", null)).toBeNull();
  });
});
