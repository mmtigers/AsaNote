import { describe, expect, it } from "vitest";
import {
  buildCsvContent,
  buildExportFilename,
  selectExportEntries,
  type CsvableRecord,
  type ExportableRecord,
} from "./selectEntries";

function makeRecord(overrides: Partial<ExportableRecord> = {}): ExportableRecord {
  return {
    recordDate: "2026-09-10",
    updatedAt: "2026-09-10T00:00:00.000Z",
    outcome: "smooth",
    userId: "me",
    ...overrides,
  };
}

function makeCsvRecord(overrides: Partial<CsvableRecord> = {}): CsvableRecord {
  return {
    ...makeRecord(),
    wakeTime: null,
    departTime: null,
    memo: null,
    wakeTags: [],
    triggerTags: [],
    reasonTags: [],
    responseTags: [],
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

describe("buildCsvContent", () => {
  it("ヘッダー行と各列を出力する", () => {
    const csv = buildCsvContent(
      [
        makeCsvRecord({
          recordDate: "2026-09-10",
          outcome: "smooth",
          wakeTime: "07:00",
          departTime: "07:59",
          reasonTags: ["早寝早起きできた"],
          memo: "順調でした",
          userId: "me",
        }),
      ],
      "me"
    );
    const [header, row] = csv.split("\r\n");
    expect(header).toBe("日付,曜日,結果,起床時刻,出発時刻,タグ,メモ,記録者");
    expect(row).toBe("2026-09-10,木,スムーズに行けた,07:00,8時より前,早寝早起きできた,順調でした,自分");
  });

  it("パートナーの記録は記録者列を「パートナー」にし、個人情報は含めない", () => {
    const csv = buildCsvContent([makeCsvRecord({ userId: "partner" })], "me");
    const [, row] = csv.split("\r\n");
    expect(row?.endsWith(",パートナー")).toBe(true);
    expect(csv).not.toContain("partner");
  });

  it("カンマ・改行・ダブルクォートを含む値はダブルクォートで囲みエスケープする", () => {
    const csv = buildCsvContent([makeCsvRecord({ memo: 'A,B"C\nD' })], "me");
    const [, row] = csv.split("\r\n");
    expect(row).toContain('"A,B""C\nD"');
  });

  it("複数タグは読点で連結する", () => {
    const csv = buildCsvContent(
      [makeCsvRecord({ reasonTags: ["理由1", "理由2"], wakeTags: ["起床タグ"] })],
      "me"
    );
    const [, row] = csv.split("\r\n");
    expect(row).toContain("起床タグ、理由1、理由2");
  });
});

describe("buildExportFilename", () => {
  it("開始日と終了日が同じなら単日形式にする", () => {
    expect(buildExportFilename("2026-09-10", "2026-09-10")).toBe("asanote_20260910.csv");
  });

  it("開始日と終了日が違えば期間形式にする", () => {
    expect(buildExportFilename("2026-09-01", "2026-09-30")).toBe("asanote_20260901-20260930.csv");
  });
});
