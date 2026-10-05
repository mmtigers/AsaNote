import { describe, expect, it } from "vitest";
import type { LocalRecord } from "@/lib/db/localDb";
import { buildCsvContent, buildCsvFilename, buildExportFilename, selectExportEntries } from "./selectEntries";

function rec(over: Partial<LocalRecord> = {}): LocalRecord {
  return {
    id: "r1",
    recordDate: "2026-10-03",
    outcome: "calm",
    times: {},
    dinner: null,
    dinnerWhy: [],
    free: [],
    friend: [],
    trigger: [],
    behavior: [],
    response: [],
    responseEffect: null,
    body: [],
    memo: null,
    userId: "me",
    childId: "c1",
    createdAt: "2026-10-03T12:00:00Z",
    updatedAt: "2026-10-03T12:00:00Z",
    syncStatus: "synced",
    ...over,
  };
}

const BASE = { startDate: "2026-10-01", endDate: "2026-10-05", childId: null, includePartner: true, currentUserId: "me" };

describe("selectExportEntries", () => {
  it("期間・様子の有無・子どもで絞り、日付の古い順に並べる", () => {
    const out = selectExportEntries(
      [
        rec({ id: "b", recordDate: "2026-10-04" }),
        rec({ id: "a", recordDate: "2026-10-02" }),
        rec({ id: "out", recordDate: "2026-10-06" }),
        rec({ id: "draft", outcome: null }),
        rec({ id: "other", childId: "c2" }),
      ],
      { ...BASE, childId: "c1" }
    );
    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("パートナーの記録は includePartner=false で除外する", () => {
    const records = [rec({ id: "mine" }), rec({ id: "theirs", userId: "partner" })];
    expect(selectExportEntries(records, { ...BASE, includePartner: false }).map((r) => r.id)).toEqual(["mine"]);
    expect(selectExportEntries(records, BASE)).toHaveLength(2);
  });
});

describe("ファイル名", () => {
  it("単日と期間", () => {
    expect(buildExportFilename("2026-10-01", "2026-10-01")).toBe("yorunote_20261001");
    expect(buildCsvFilename("2026-10-01", "2026-10-05")).toBe("yorunote_20261001-20261005.csv");
  });
});

describe("buildCsvContent", () => {
  const ctx = {
    currentUserId: "me",
    childNames: new Map([["c1", "智矢"]]),
    photoCounts: new Map([["r1", 2]]),
  };

  it("列を展開し、写真は枚数のみ、パートナーはメールを出さず表示のみ", () => {
    const csv = buildCsvContent(
      [
        rec({ times: { hwStart: "16:00", bed: "20:30" }, dinner: "little", trigger: ["宿題", "食事"], outcome: "rough" }),
        rec({ id: "r2", userId: "partner", childId: null }),
      ],
      ctx
    );
    const [header = "", first = "", second = ""] = csv.split("\r\n");
    expect(header.split(",")).toHaveLength(first.split(",").length);
    expect(first).toContain("2026-10-03,土,智矢,少し荒れた,,16:00");
    expect(first).toContain("少し,,,,宿題、食事");
    expect(first.endsWith(",2,自分")).toBe(true);
    expect(second.endsWith(",0,パートナー")).toBe(true);
  });

  it("カンマ・改行・引用符をエスケープし、数式として解釈される先頭文字を無効化する", () => {
    const csv = buildCsvContent([rec({ memo: '=SUM(A1)\n"急"、a,b' })], ctx);
    expect(csv).toContain(`"'=SUM(A1)\n""急""、a,b"`);
  });
});
