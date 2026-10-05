import { describe, expect, it } from "vitest";
import { fitWithin } from "./image";

describe("fitWithin", () => {
  it("長辺が上限以下ならそのまま", () => {
    expect(fitWithin(1200, 800, 1600)).toEqual({ width: 1200, height: 800 });
  });

  it("横長は幅を上限にそろえ、縦横比を保つ", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it("縦長は高さを上限にそろえる", () => {
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });
});
