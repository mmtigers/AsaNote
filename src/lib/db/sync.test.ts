import { describe, expect, it } from "vitest";
import { fromRecordRow, normalizeTimeValue, photoStoragePath, toRecordRow } from "./sync";
import type { LocalRecord } from "./localDb";

const RECORD: LocalRecord = {
  id: "r1",
  recordDate: "2026-10-05",
  outcome: "rough",
  times: { arrive: "15:00", hwStart: "16:00", bed: "20:45" },
  dinner: "little",
  dinnerWhy: ["においが苦手"],
  free: ["TV"],
  friend: [],
  trigger: ["宿題"],
  behavior: ["号泣"],
  response: ["放置"],
  responseEffect: "mid",
  body: ["蕁麻疹"],
  memo: "メモ",
  userId: null,
  childId: "c1",
  createdAt: "2026-10-05T12:00:00.000Z",
  updatedAt: "2026-10-05T12:30:00.000Z",
  syncStatus: "pending",
};

describe("normalizeTimeValue", () => {
  it("秒や小数秒を落として HH:MM にそろえる", () => {
    expect(normalizeTimeValue("20:45:00")).toBe("20:45");
    expect(normalizeTimeValue("20:45:00.123")).toBe("20:45");
    expect(normalizeTimeValue("20:45")).toBe("20:45");
  });

  it("空は null", () => {
    expect(normalizeTimeValue(null)).toBeNull();
    expect(normalizeTimeValue("")).toBeNull();
  });
});

describe("toRecordRow / fromRecordRow", () => {
  it("未入力の節目は null の列になり、user_id が付く", () => {
    const row = toRecordRow(RECORD, "u1");
    expect(row.user_id).toBe("u1");
    expect(row.t_arrive).toBe("15:00");
    expect(row.t_dinner).toBeNull();
    expect(row.t_bed).toBe("20:45");
    expect(row.child_id).toBe("c1");
    expect(row.response_effect).toBe("mid");
  });

  it("往復しても内容が変わらない(秒付きの time でも HH:MM に戻る)", () => {
    const row = toRecordRow(RECORD, "u1");
    const cloud = { ...row, t_arrive: "15:00:00", t_hw_start: "16:00:00", t_bed: "20:45:00" };
    const back = fromRecordRow(cloud);
    expect(back).toEqual({ ...RECORD, userId: "u1", syncStatus: "synced" });
  });

  it("配列列が null で返ってきても空配列にする", () => {
    const row = { ...toRecordRow(RECORD, "u1"), free_tags: null, dinner_why: null };
    const back = fromRecordRow(row);
    expect(back.free).toEqual([]);
    expect(back.dinnerWhy).toEqual([]);
  });
});

describe("photoStoragePath", () => {
  it("最初のフォルダが user_id になる(Storage の RLS がこれを見る)", () => {
    expect(photoStoragePath("u1", "r1", "p1")).toBe("u1/r1/p1.jpg");
  });
});
