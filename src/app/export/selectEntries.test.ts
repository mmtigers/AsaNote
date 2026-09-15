import { describe, expect, it } from "vitest";
import { selectExportEntries, type ExportableRecord } from "./selectEntries";

function makeRecord(overrides: Partial<ExportableRecord> = {}): ExportableRecord {
  return {
    recordDate: "2026-09-10",
    updatedAt: "2026-09-10T00:00:00.000Z",
    outcome: "smooth",
    userId: "me",
    ...overrides,
  };
}

describe("selectExportEntries", () => {
  it("outcome未設定の記録は除外する", () => {
    const records = [makeRecord({ outcome: null })];
    const result = selectExportEntries(records, {
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      includePartner: true,
      currentUserId: "me",
    });
    expect(result).toHaveLength(0);
  });

  it("指定した期間外の記録は除外する", () => {
    const records = [
      makeRecord({ recordDate: "2026-08-31" }),
      makeRecord({ recordDate: "2026-09-15" }),
      makeRecord({ recordDate: "2026-10-01" }),
    ];
    const result = selectExportEntries(records, {
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      includePartner: true,
      currentUserId: "me",
    });
    expect(result.map((r) => r.recordDate)).toEqual(["2026-09-15"]);
  });

  it("includePartner=falseなら自分以外の記録を除外する", () => {
    const records = [makeRecord({ userId: "me" }), makeRecord({ userId: "partner" })];
    const result = selectExportEntries(records, {
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      includePartner: false,
      currentUserId: "me",
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.userId).toBe("me");
  });

  it("includePartner=trueならパートナーの記録も含める", () => {
    const records = [makeRecord({ userId: "me" }), makeRecord({ userId: "partner" })];
    const result = selectExportEntries(records, {
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      includePartner: true,
      currentUserId: "me",
    });
    expect(result).toHaveLength(2);
  });

  it("日付の古い順(時系列)に並べる", () => {
    const records = [
      makeRecord({ recordDate: "2026-09-15", updatedAt: "2026-09-15T00:00:00.000Z" }),
      makeRecord({ recordDate: "2026-09-01", updatedAt: "2026-09-01T00:00:00.000Z" }),
      makeRecord({ recordDate: "2026-09-10", updatedAt: "2026-09-10T00:00:00.000Z" }),
    ];
    const result = selectExportEntries(records, {
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      includePartner: true,
      currentUserId: "me",
    });
    expect(result.map((r) => r.recordDate)).toEqual(["2026-09-01", "2026-09-10", "2026-09-15"]);
  });

  it("同日であればupdatedAtの古い順に並べる", () => {
    const records = [
      makeRecord({ recordDate: "2026-09-10", updatedAt: "2026-09-10T12:00:00.000Z" }),
      makeRecord({ recordDate: "2026-09-10", updatedAt: "2026-09-10T08:00:00.000Z" }),
    ];
    const result = selectExportEntries(records, {
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      includePartner: true,
      currentUserId: "me",
    });
    expect(result.map((r) => r.updatedAt)).toEqual(["2026-09-10T08:00:00.000Z", "2026-09-10T12:00:00.000Z"]);
  });
});
