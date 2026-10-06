import { describe, expect, it } from "vitest";
import { WAKE_SLOTS, wakeSlotOfTimeValue } from "./wakeTime";

describe("WAKE_SLOTS", () => {
  it("3区分を早い順に持つ", () => {
    expect(WAKE_SLOTS.map((s) => s.label)).toEqual(["7時より前", "7時〜7時15分", "7時15分〜"]);
  });

  it("保存する代表値を読み直すと必ず同じ区分に戻る", () => {
    for (const slot of WAKE_SLOTS) {
      expect(wakeSlotOfTimeValue(slot.value)?.key).toBe(slot.key);
    }
  });
});

describe("wakeSlotOfTimeValue", () => {
  it("境界で振り分ける", () => {
    expect(wakeSlotOfTimeValue("06:59")?.label).toBe("7時より前");
    expect(wakeSlotOfTimeValue("07:00")?.label).toBe("7時〜7時15分");
    expect(wakeSlotOfTimeValue("07:14")?.label).toBe("7時〜7時15分");
    expect(wakeSlotOfTimeValue("07:15")?.label).toBe("7時15分〜");
  });

  it("未入力・壊れた値はnull", () => {
    expect(wakeSlotOfTimeValue("")).toBeNull();
    expect(wakeSlotOfTimeValue(null)).toBeNull();
    expect(wakeSlotOfTimeValue("abc")).toBeNull();
  });
});
