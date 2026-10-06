import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/sync", () => ({ syncPendingChanges: vi.fn() }));

import { localDb } from "@/lib/db/localDb";
import { saveRecord } from "@/lib/db/records";
import { applyCopyFields, copyFormToChildren } from "./copyToChildren";
import { emptyForm, formToInput } from "./formState";

const source = {
  ...emptyForm("2026-10-05", "c1"),
  outcome: "rough" as const,
  times: { dinner: "18:30", bed: "21:00" },
  dinner: "little" as const,
  dinnerWhy: ["眠い"],
  free: ["TV"],
  trigger: ["宿題"],
  memo: "元の子のメモ",
};

beforeEach(async () => {
  await Promise.all(localDb.tables.map((t) => t.clear()));
});

describe("applyCopyFields", () => {
  it("選んだ項目だけ上書きし、子ども固有の項目には触れない", () => {
    const target = { ...emptyForm("2026-10-05", "c2"), outcome: "calm" as const, memo: "弟のメモ", times: { bed: "20:00", bath: "19:30" } };
    const out = applyCopyFields(target, source, ["time:bed", "dinner"]);
    expect(out.times).toEqual({ bed: "21:00", bath: "19:30" });
    expect(out.dinner).toBe("little");
    expect(out.dinnerWhy).toEqual(["眠い"]);
    expect(out.outcome).toBe("calm");
    expect(out.memo).toBe("弟のメモ");
    expect(out.free).toEqual([]);
  });

  it("元が未入力の時刻は先の値も消す", () => {
    const target = { ...emptyForm("2026-10-05", "c2"), times: { bath: "19:30" } };
    expect(applyCopyFields(target, source, ["time:bath"]).times).toEqual({});
  });
});

describe("copyFormToChildren", () => {
  it("記録が無い子には様子未入力の記録を作る", async () => {
    await copyFormToChildren(source, ["c2"], ["time:dinner", "time:bed"], "u1");
    const rec = (await localDb.records.toArray()).find((r) => r.childId === "c2");
    expect(rec).toMatchObject({ outcome: null, times: { dinner: "18:30", bed: "21:00" }, userId: "u1", syncStatus: "pending" });
  });

  it("既にある子の記録には、選んだ項目だけ反映する", async () => {
    const existing = { ...emptyForm("2026-10-05", "c2"), outcome: "calm" as const, free: ["ゲーム"], memo: "keep" };
    await saveRecord(formToInput(existing, "u1"));
    await copyFormToChildren(source, ["c2"], ["time:bed"], "u1");
    const all = (await localDb.records.toArray()).filter((r) => r.childId === "c2");
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ outcome: "calm", free: ["ゲーム"], memo: "keep", times: { bed: "21:00" } });
  });

  it("コピー対象が空なら何もしない", async () => {
    await copyFormToChildren(source, ["c2"], [], "u1");
    expect(await localDb.records.count()).toBe(0);
  });

  it("元の子自身は無視する", async () => {
    await copyFormToChildren(source, ["c1"], ["time:bed"], "u1");
    expect(await localDb.records.count()).toBe(0);
  });
});
