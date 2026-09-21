import { describe, expect, it } from "vitest";
import { hourOptions, joinTimeValue, minuteOptions, splitTimeValue } from "./departTime";

describe("hourOptions", () => {
  it("0〜23時を2桁で返す", () => {
    const hours = hourOptions();
    expect(hours).toHaveLength(24);
    expect(hours[0]).toBe("00");
    expect(hours[23]).toBe("23");
  });
});

describe("minuteOptions", () => {
  it("5分刻みで返す", () => {
    const minutes = minuteOptions();
    expect(minutes).toHaveLength(12);
    expect(minutes[0]).toBe("00");
    expect(minutes[1]).toBe("05");
    expect(minutes[11]).toBe("55");
  });

  it("5分刻みでない既存の値は時刻順の位置に混ぜて残す(勝手に丸めない)", () => {
    const minutes = minuteOptions("08");
    expect(minutes).toContain("08");
    expect(minutes.indexOf("08")).toBe(minutes.indexOf("05") + 1);
    expect(minutes.indexOf("08")).toBe(minutes.indexOf("10") - 1);
  });

  it("5分刻みの値や想定外の値では選択肢を増やさない", () => {
    expect(minuteOptions("15")).toHaveLength(12);
    expect(minuteOptions("")).toHaveLength(12);
    expect(minuteOptions("99")).toHaveLength(12);
  });
});

describe("splitTimeValue", () => {
  it("HH:MM を時・分に分ける", () => {
    expect(splitTimeValue("07:30")).toEqual({ hour: "07", minute: "30" });
  });

  it("1桁の時は2桁へ揃える", () => {
    expect(splitTimeValue("7:05")).toEqual({ hour: "07", minute: "05" });
  });

  it("未入力・想定外の値は未選択として扱う", () => {
    expect(splitTimeValue("")).toEqual({ hour: "", minute: "" });
    expect(splitTimeValue("あさ")).toEqual({ hour: "", minute: "" });
    expect(splitTimeValue("24:00")).toEqual({ hour: "", minute: "" });
    expect(splitTimeValue("07:60")).toEqual({ hour: "", minute: "" });
  });
});

describe("joinTimeValue", () => {
  it("時と分から HH:MM を作る", () => {
    expect(joinTimeValue("07", "30")).toBe("07:30");
  });

  it("時だけ選ばれたら0分として扱う(分を選び直させない)", () => {
    expect(joinTimeValue("07", "")).toBe("07:00");
  });

  it("時が未選択なら未入力に戻す(クリア)", () => {
    expect(joinTimeValue("", "30")).toBe("");
    expect(joinTimeValue("", "")).toBe("");
  });
});
