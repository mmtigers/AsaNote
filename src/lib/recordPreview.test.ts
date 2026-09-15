import { describe, expect, it } from "vitest";
import { buildDiaryText } from "./recordPreview";

describe("buildDiaryText", () => {
  it("outcomeが無ければ空文字を返す", () => {
    expect(buildDiaryText({ outcome: null, reasonTags: [], departTime: null, memo: null })).toBe("");
  });

  it("outcomeのみの場合、結果ラベルのみの文になる", () => {
    expect(buildDiaryText({ outcome: "smooth", reasonTags: [], departTime: null, memo: null })).toBe(
      "スムーズに行けた。"
    );
  });

  it("理由タグ・出発時刻・メモがあれば、すべて連結する", () => {
    const text = buildDiaryText({
      outcome: "reluctant",
      reasonTags: ["友達トラブル", "眠い・疲れ"],
      departTime: "08:10",
      memo: "少し落ち着いて出発できた",
    });
    expect(text).toBe(
      "行き渋った。理由は「友達トラブル・眠い・疲れ」。08:10に出発。少し落ち着いて出発できた。"
    );
  });
});
