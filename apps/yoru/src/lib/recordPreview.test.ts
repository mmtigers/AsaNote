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
      times: { arrive: "15:00", hwStart: "16:00", hwEnd: "16:30", bed: "20:45" },
      dinner: "little",
      dinnerWhy: ["においが苦手"],
      free: ["TV", "ドラえもん"],
      trigger: ["時間切れ・間に合わない"],
      behavior: ["号泣"],
      response: ["放置"],
      responseEffect: "mid",
      body: ["蕁麻疹"],
      photoCount: 2,
      memo: "友達を家に呼べた。",
    });
    expect(text).toBe(
      "少し荒れた夜。15:00ごろに帰宅。宿題は16:00ごろから16:30ごろまで。夕食は少し(においが苦手)。" +
        "自由時間は「TV・ドラえもん」。きっかけは「時間切れ・間に合わない」。号泣があった。" +
        "対応は「放置」(少し効いた)。からだ: 蕁麻疹。写真2枚。20:45ごろに消灯。友達を家に呼べた。"
    );
  });

  it("穏やかな日は、荒れの項目が残っていても文章にしない", () => {
    const text = buildRecordPreview({ ...EMPTY, outcome: "calm", trigger: ["宿題"], behavior: ["号泣"], response: ["放置"] });
    expect(text).toBe("穏やかな夜。");
  });

  it("宿題の開始が無く終了だけのとき", () => {
    expect(buildRecordPreview({ ...EMPTY, outcome: "calm", times: { hwEnd: "17:30" } })).toBe(
      "穏やかな夜。宿題は17:30ごろに終了。"
    );
  });
});
