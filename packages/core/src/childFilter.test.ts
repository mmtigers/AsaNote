import { describe, expect, it } from "vitest";
import { matchesChildFilter, UNASSIGNED_FILTER } from "./childFilter";

describe("matchesChildFilter", () => {
  it("すべて(null)は、未分類も含めて全部に一致する", () => {
    expect(matchesChildFilter("c1", null)).toBe(true);
    expect(matchesChildFilter(null, null)).toBe(true);
    expect(matchesChildFilter(undefined, null)).toBe(true);
  });

  it("子どものidは、その子の記録だけに一致する", () => {
    expect(matchesChildFilter("c1", "c1")).toBe(true);
    expect(matchesChildFilter("c2", "c1")).toBe(false);
    expect(matchesChildFilter(null, "c1")).toBe(false);
  });

  it("未分類は、childId が無い記録だけに一致する", () => {
    expect(matchesChildFilter(null, UNASSIGNED_FILTER)).toBe(true);
    expect(matchesChildFilter(undefined, UNASSIGNED_FILTER)).toBe(true);
    expect(matchesChildFilter("c1", UNASSIGNED_FILTER)).toBe(false);
  });
});
