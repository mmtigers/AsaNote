import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_INPUT } from "@/lib/db/records";
import { clearAllDrafts, clearDraft, draftKey, loadDraft, saveDraft } from "./recordDraft";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

const input = { ...EMPTY_INPUT, breakfast: "ate" as const, memo: "途中" };

describe("recordDraft", () => {
  it("保存した下書きを読み戻せる", () => {
    saveDraft("u1", "2026-10-17", input, new Date("2026-10-17T01:00:00Z"));
    expect(loadDraft("u1", "2026-10-17")).toEqual({ input, savedAt: "2026-10-17T01:00:00.000Z" });
  });

  it("利用者・日付ごとに分かれる(共有の端末で混ざらない)", () => {
    saveDraft("u1", "2026-10-17", input);
    expect(loadDraft("u2", "2026-10-17")).toBeNull();
    expect(loadDraft("u1", "2026-10-16")).toBeNull();
  });

  it("消すと読めない", () => {
    saveDraft("u1", "2026-10-17", input);
    clearDraft("u1", "2026-10-17");
    expect(loadDraft("u1", "2026-10-17")).toBeNull();
  });

  it("壊れた値は無視する", () => {
    window.localStorage.setItem(draftKey("u1", "2026-10-17"), "{not json");
    expect(loadDraft("u1", "2026-10-17")).toBeNull();
  });

  it("足りない項目は未入力で埋める", () => {
    window.localStorage.setItem(draftKey("u1", "2026-10-17"), JSON.stringify({ input: { lunch: "little" }, savedAt: "t" }));
    expect(loadDraft("u1", "2026-10-17")?.input).toEqual({ ...EMPTY_INPUT, lunch: "little" });
  });

  it("全部消すときも、おやノートの下書きだけを消す", () => {
    saveDraft("u1", "2026-10-17", input);
    saveDraft("u2", "2026-10-16", input);
    window.localStorage.setItem("other-app:key", "keep");
    clearAllDrafts();
    expect(loadDraft("u1", "2026-10-17")).toBeNull();
    expect(loadDraft("u2", "2026-10-16")).toBeNull();
    expect(window.localStorage.getItem("other-app:key")).toBe("keep");
  });

  it("localStorage が使えなくても例外を出さない", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => saveDraft("u1", "2026-10-17", input)).not.toThrow();
    expect(loadDraft("u1", "2026-10-17")).toBeNull();
  });
});
