/**
 * 出発時刻は3区分(8時より前 / 8時過ぎ / 8時半以降)で記録するが、保存先は従来どおり
 * time 型の列。区分 -> 代表値 -> 区分 の往復でずれないことと、旧データの任意の時刻が
 * どの区分に寄るかを固定しておく。
 */
import { describe, expect, it } from "vitest";
import { DEPART_SLOTS, departTimeLabel, slotOfTimeValue } from "./departTime";

describe("DEPART_SLOTS", () => {
  it("3区分を早い順に持つ", () => {
    expect(DEPART_SLOTS.map((s) => s.label)).toEqual(["8時より前", "8時過ぎ", "8時半以降"]);
  });

  it("保存する代表値を読み直すと必ず同じ区分に戻る(往復してずれない)", () => {
    for (const slot of DEPART_SLOTS) {
      expect(slotOfTimeValue(slot.value)?.key).toBe(slot.key);
    }
  });
});

describe("slotOfTimeValue", () => {
  it("境界で振り分ける(8:00ちょうどは「8時過ぎ」、8:30ちょうどは「8時半以降」)", () => {
    expect(slotOfTimeValue("07:59")?.label).toBe("8時より前");
    expect(slotOfTimeValue("08:00")?.label).toBe("8時過ぎ");
    expect(slotOfTimeValue("08:29")?.label).toBe("8時過ぎ");
    expect(slotOfTimeValue("08:30")?.label).toBe("8時半以降");
  });

  it("旧データの任意の時刻も3区分のどれかへ寄せる", () => {
    expect(slotOfTimeValue("07:08")?.label).toBe("8時より前");
    expect(slotOfTimeValue("06:00")?.label).toBe("8時より前");
    expect(slotOfTimeValue("19:08")?.label).toBe("8時半以降");
  });

  it("未入力・想定外の値は区分なし", () => {
    expect(slotOfTimeValue("")).toBeNull();
    expect(slotOfTimeValue(null)).toBeNull();
    expect(slotOfTimeValue(undefined)).toBeNull();
    expect(slotOfTimeValue("あさ")).toBeNull();
    expect(slotOfTimeValue("25:00")).toBeNull();
  });
});

describe("departTimeLabel", () => {
  it("区分名を返す", () => {
    expect(departTimeLabel("07:30")).toBe("8時より前");
    expect(departTimeLabel("08:15")).toBe("8時過ぎ");
  });

  it("未入力・想定外の値はnull(日記文にその節を出さない)", () => {
    expect(departTimeLabel(null)).toBeNull();
    expect(departTimeLabel("")).toBeNull();
    expect(departTimeLabel("あさ")).toBeNull();
  });
});
