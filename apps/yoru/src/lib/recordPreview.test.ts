import { describe, expect, it } from "vitest";
import { buildRecordPreview, type PreviewInput } from "./recordPreview";

const EMPTY: PreviewInput = {
  outcome: null,
  times: {},
  dinner: null,
  dinnerWhy: [],
  free: [],
  trigger: [],
  behavior: [],
  response: [],
  responseEffect: null,
  body: [],
  memo: null,
  photoCount: 0,
};

describe("buildRecordPreview", () => {
  it("結果が未選択ならnull", () => {
    expect(buildRecordPreview(EMPTY)).toBeNull();
  });

  it("結果だけなら一文", () => {
    expect(buildRecordPreview({ ...EMPTY, outcome: "calm" })).toBe("穏やかな夜。");
  });

  it("入力した項目だけを文章にする", () => {
    const text = buildRecordPreview({
      ...EMPTY,
      outcome: "rough",
      times: { arrive: "late", hwStart: "early", bed: "mid" },
      dinner: "little",
      dinnerWhy: ["においが苦手"],
      free: ["TV", "読書"],
      trigger: ["時間切れ・間に合わない"],
      behavior: ["号泣"],
      response: ["放置"],
      responseEffect: "mid",
      body: ["疲れ"],
      photoCount: 2,
      memo: "友達を家に呼べた。",
    });
    expect(text).toBe(
      "少し荒れた夜。15時以降に帰宅。宿題は15〜17時に開始。夕食は少し(においが苦手)。" +
        "自由時間は「TV・読書」。きっかけは「時間切れ・間に合わない」。号泣があった。" +
        "対応は「放置」(少し効いた)。からだ: 疲れ。写真2枚。20〜21時に消灯。友達を家に呼べた。"
    );
  });

  it("穏やかな日は、荒れの項目が残っていても文章にしない", () => {
    const text = buildRecordPreview({ ...EMPTY, outcome: "calm", trigger: ["宿題"], behavior: ["号泣"], response: ["放置"] });
    expect(text).toBe("穏やかな夜。");
  });

  it("旧い時刻の記録は時間帯に寄せて文章にする", () => {
    expect(buildRecordPreview({ ...EMPTY, outcome: "calm", times: { arrive: "14:45", bed: "21:30" } })).toBe(
      "穏やかな夜。14〜15時に帰宅。21時以降に消灯。"
    );
  });
});
