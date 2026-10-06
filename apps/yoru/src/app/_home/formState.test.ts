import { describe, expect, it } from "vitest";
import { MEMO_MAX_LENGTH } from "@/constants/choices";
import type { LocalRecord } from "@/lib/db/localDb";
import { emptyForm, formFromRecord, formToInput } from "./formState";

describe("formState", () => {
  it("新しいフォームは日付と子どもだけを持ち、idは毎回違う", () => {
    const a = emptyForm("2026-10-05", "c1");
    const b = emptyForm("2026-10-05", "c1");
    expect(a).toMatchObject({ recordDate: "2026-10-05", childId: "c1", outcome: null, memo: "" });
    expect(a.id).not.toBe(b.id);
  });

  it("保存済みの記録からフォームに戻して、入力に変換しても内容が変わらない", () => {
    const record: LocalRecord = {
      ...formToInput({ ...emptyForm("2026-10-05", null), outcome: "rough", memo: "m", free: ["TV"], times: { bed: "20:45" } }, "u1"),
      createdAt: "x",
      updatedAt: "x",
      syncStatus: "synced",
    };
    const form = formFromRecord(record);
    expect(form.times).toEqual({ bed: "20:45" });
    expect(formToInput(form, "u1")).toEqual({ ...record, createdAt: undefined, updatedAt: undefined, syncStatus: undefined });
  });

  it("メモは上限で切り詰める", () => {
    const form = { ...emptyForm("2026-10-05", null), memo: "あ".repeat(MEMO_MAX_LENGTH + 10) };
    expect(formToInput(form, null).memo).toHaveLength(MEMO_MAX_LENGTH);
  });
});
