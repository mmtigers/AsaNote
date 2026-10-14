import { describe, expect, it } from "vitest";
import { normalizeTag, normalizeTags, TAG_MAX_LENGTH } from "./normalizeTag";

describe("normalizeTag", () => {
  it("前後の半角・全角スペースを除く", () => {
    expect(normalizeTag("  朝のシャワー　")).toBe("朝のシャワー");
  });

  it("末尾の句読点・感嘆符を除く", () => {
    expect(normalizeTag("7:55に出ると自分で決めた、")).toBe("7:55に出ると自分で決めた");
    expect(normalizeTag("朝の準備に余裕があった。")).toBe("朝の準備に余裕があった");
    expect(normalizeTag("よく寝た!!")).toBe("よく寝た");
    expect(normalizeTag("楽しみ、。 ")).toBe("楽しみ");
  });

  it("先頭の句読点も除く", () => {
    expect(normalizeTag("、朝のシャワー")).toBe("朝のシャワー");
  });

  it("途中の「、」はスペースに置き換え、連続スペースは1つにする", () => {
    expect(normalizeTag("雨、寒い")).toBe("雨 寒い");
    expect(normalizeTag("雨、  寒い")).toBe("雨 寒い");
  });

  it("途中の「。」や疑問符は残す", () => {
    expect(normalizeTag("なんで?")).toBe("なんで?");
    expect(normalizeTag("A。B")).toBe("A。B");
  });

  it("句読点だけ・空白だけは空文字になる", () => {
    expect(normalizeTag("、。")).toBe("");
    expect(normalizeTag("   ")).toBe("");
  });

  it("初期セットのタグは変わらない", () => {
    for (const t of ["早寝早起きできた", "行きたくない(理由不明)", "眠い・疲れ"]) {
      expect(normalizeTag(t)).toBe(t);
    }
  });

  it("正規化は冪等", () => {
    const once = normalizeTag("、 朝、シャワー。 ");
    expect(normalizeTag(once)).toBe(once);
  });
});

describe("normalizeTags", () => {
  it("正規化後に同じになるものは1つにまとめ、空は除く", () => {
    expect(normalizeTags(["決めた、", "決めた", "。", "朝のシャワー"])).toEqual(["決めた", "朝のシャワー"]);
  });
});

describe("TAG_MAX_LENGTH", () => {
  it("実際に使われている「7:55に出ると自分で決めた」は上限内", () => {
    expect(Array.from("7:55に出ると自分で決めた").length).toBeLessThanOrEqual(TAG_MAX_LENGTH);
  });

  it("文章のタグ(27文字)は上限を超える", () => {
    expect(Array.from("朝シャワーを浴びてYouTubeを20分見てから登校できた").length).toBeGreaterThan(TAG_MAX_LENGTH);
  });
});
