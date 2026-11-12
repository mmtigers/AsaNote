// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkDraft, countChars } from "./liaisonPrompt.ts";

describe("countChars", () => {
  it("改行・空白を除いて、書記素で数える", () => {
    expect(countChars("あい う\nえお")).toBe(5);
    expect(countChars("👨‍👩‍👧了解")).toBe(3);
  });
});

describe("checkDraft", () => {
  const memo80 = "あ".repeat(80);
  it("指定の文字数の±15%なら ok", () => {
    expect(checkDraft({ memo: "あ".repeat(68), contact: "" }, 80).kind).toBe("ok");
    expect(checkDraft({ memo: "あ".repeat(92), contact: "" }, 80).kind).toBe("ok");
  });
  it("外れたら length", () => {
    expect(checkDraft({ memo: "あ".repeat(67), contact: "" }, 80).kind).toBe("length");
    expect(checkDraft({ memo: "あ".repeat(93), contact: "" }, 80).kind).toBe("length");
  });
  it("連絡事項が長すぎたら length", () => {
    expect(checkDraft({ memo: memo80, contact: "い".repeat(101) }, 80).kind).toBe("length");
  });
  it("形が不正・空なら invalid", () => {
    expect(checkDraft(null, 80).kind).toBe("invalid");
    expect(checkDraft({ memo: 1, contact: "" }, 80).kind).toBe("invalid");
    expect(checkDraft({ memo: "  ", contact: "" }, 80).kind).toBe("invalid");
  });
  it("見出し・箇条書きは invalid", () => {
    expect(checkDraft({ memo: `## 様子\n${memo80}`, contact: "" }, 80).kind).toBe("invalid");
    expect(checkDraft({ memo: `- ${memo80}`, contact: "" }, 80).kind).toBe("invalid");
  });
  it("前後の空白を取り除いて返す", () => {
    expect(checkDraft({ memo: ` ${memo80}\n`, contact: " 連絡 " }, 80)).toEqual({
      kind: "ok",
      draft: { memo: memo80, contact: "連絡" },
    });
  });
});
