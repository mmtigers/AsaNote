import { describe, expect, it, vi } from "vitest";
import type { Child } from "@note/core/types/group";

vi.mock("@note/core/db/children", async (orig) => ({ ...(await orig<object>()), useChildren: () => null }));
vi.mock("./selectedChild", () => ({ useSelectedChildId: () => null }));

import { resolveEffectiveChildId } from "./children";

const c = (id: string): Child => ({ id, name: id, created_by: "u", created_at: "x" });

describe("resolveEffectiveChildId(よるノート)", () => {
  it("子どもが1人のときも、その子のIDを返す", () => {
    expect(resolveEffectiveChildId([c("a")], null)).toBe("a");
    expect(resolveEffectiveChildId([c("a")], "zzz")).toBe("a");
  });
  it("0人・未取得は null(未分類)", () => {
    expect(resolveEffectiveChildId([], null)).toBeNull();
    expect(resolveEffectiveChildId(null, null)).toBeNull();
  });
  it("2人以上は選択中の子ども(未選択・不明なら先頭)", () => {
    expect(resolveEffectiveChildId([c("a"), c("b")], "b")).toBe("b");
    expect(resolveEffectiveChildId([c("a"), c("b")], null)).toBe("a");
  });
});
