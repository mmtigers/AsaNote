import { describe, expect, it } from "vitest";
import { releases } from "@/data/releases";
import { GET } from "./route";

describe("GET /releases.json", () => {
  it("更新履歴(/updates と同じ releases)をそのまま JSON で返す", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual(releases);
  });

  it("ダッシュボードが読む形(version / date / title / summary / details[])を満たす", async () => {
    const body = (await GET().json()) as Array<Record<string, unknown>>;
    expect(body.length).toBeGreaterThan(0);
    for (const entry of body) {
      expect(typeof entry.version).toBe("string");
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof entry.title).toBe("string");
      expect(typeof entry.summary).toBe("string");
      expect(Array.isArray(entry.details)).toBe(true);
    }
  });
});
