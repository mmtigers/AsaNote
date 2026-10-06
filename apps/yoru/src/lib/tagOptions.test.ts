import { describe, expect, it } from "vitest";
import { countTagUsage, rankTagOptions } from "./tagOptions";

const BASE = ["A", "B", "C"];

describe("countTagUsage", () => {
  it("1件の記録内の重複は1回と数える", () => {
    const counts = countTagUsage([{ t: ["A", "A", "B"] }, { t: ["A"] }], (r) => r.t);
    expect(counts.get("A")).toBe(2);
    expect(counts.get("B")).toBe(1);
  });
});

describe("rankTagOptions", () => {
  it("使用回数の多い順、同数は初期セットの定義順", () => {
    const counts = new Map([["C", 3], ["B", 1], ["A", 1]]);
    expect(rankTagOptions(BASE, counts, [])).toEqual(["C", "A", "B"]);
  });

  it("履歴に現れた追加タグは初期セットの後ろに続く", () => {
    const counts = new Map([["X", 1]]);
    expect(rankTagOptions(BASE, counts, [])).toEqual(["X", "A", "B", "C"]);
  });

  it("フォームだけにある未保存のタグも末尾に出す。初期セットは0回でも消えない", () => {
    expect(rankTagOptions(BASE, new Map(), ["Y"])).toEqual(["A", "B", "C", "Y"]);
  });
});
