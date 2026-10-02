import { describe, expect, it } from "vitest";
import { countReasonUsage, rankReasonOptions } from "./reasonOptions";

const rec = (outcome: "smooth" | "reluctant" | "absent" | null, reasonTags: string[]) => ({ outcome, reasonTags });

describe("countReasonUsage", () => {
  it("よかった理由と気になる理由を別々に数える", () => {
    const records = [rec("smooth", ["A"]), rec("reluctant", ["B", "C"]), rec("absent", ["B"]), rec(null, ["B"])];
    expect(countReasonUsage(records, true)).toEqual(new Map([["A", 1]]));
    expect(countReasonUsage(records, false)).toEqual(
      new Map([
        ["B", 2],
        ["C", 1],
      ])
    );
  });

  it("同じ記録内の重複は1回と数える", () => {
    expect(countReasonUsage([rec("reluctant", ["B", "B"])], false).get("B")).toBe(1);
  });
});

describe("rankReasonOptions", () => {
  const base = ["x", "y", "z"];

  it("使用回数の多い順に並べ、同数は初期セットの定義順", () => {
    const counts = new Map([["z", 3], ["x", 1]]);
    expect(rankReasonOptions(base, counts, [])).toEqual(["z", "x", "y"]);
  });

  it("初期セットは0回でも残す", () => {
    expect(rankReasonOptions(base, new Map(), [])).toEqual(base);
  });

  it("記録に残っている追加タグも使用回数で並ぶ(使用0の初期セットより上になる)", () => {
    const counts = new Map([["new1", 1], ["new2", 2]]);
    expect(rankReasonOptions(base, counts, [])).toEqual(["new2", "new1", "x", "y", "z"]);
  });

  it("追加タグと初期セットが同数なら、初期セットが先", () => {
    const counts = new Map([["new1", 1], ["y", 1]]);
    expect(rankReasonOptions(base, counts, [])).toEqual(["y", "new1", "x", "z"]);
  });

  it("記録に無い追加タグは、今のフォームで使っている間だけ末尾に出る", () => {
    expect(rankReasonOptions(base, new Map(), ["draft"])).toEqual(["x", "y", "z", "draft"]);
    expect(rankReasonOptions(base, new Map(), [])).toEqual(["x", "y", "z"]);
  });
});
