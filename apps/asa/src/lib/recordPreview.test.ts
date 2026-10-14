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
      "行き渋った。理由は「友達トラブル・眠い・疲れ」。8時過ぎに出発。少し落ち着いて出発できた。"
    );
  });
});

describe("buildDiaryText の理由タグの表記ゆれ", () => {
  it("末尾の句読点を除いて連結する", () => {
    expect(
      buildDiaryText({ outcome: "smooth", reasonTags: ["決めた、", "余裕があった。"], departTime: null, memo: null })
    ).toBe("スムーズに行けた。理由は「決めた・余裕があった」。");
  });
});

// 出発時刻は3区分で記録するため、保存値(代表値の時刻)ではなく区分名で出す。
// 旧データの任意の時刻も同じ境界で区分名に寄せる。
describe("buildDiaryText の出発時刻", () => {
  function textOf(departTime: string | null): string {
    return buildDiaryText({ outcome: "smooth", reasonTags: [], departTime, memo: null });
  }

  it("区分名で出す", () => {
    expect(textOf("07:59")).toBe("スムーズに行けた。8時より前に出発。");
    expect(textOf("08:15")).toBe("スムーズに行けた。8時過ぎに出発。");
    expect(textOf("08:30")).toBe("スムーズに行けた。8時半以降に出発。");
  });

  it("旧データの任意の時刻も区分名に寄せる", () => {
    expect(textOf("07:08")).toBe("スムーズに行けた。8時より前に出発。");
  });

  it("想定外の値は出発の節ごと出さない", () => {
    expect(textOf("あさ")).toBe("スムーズに行けた。");
  });
});
