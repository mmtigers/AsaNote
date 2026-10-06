import { afterEach, describe, expect, it } from "vitest";
import { DRAFT_STORAGE_KEY } from "@/lib/draft";
import { clearDraft, loadDraft, saveDraft } from "./draftStorage";
import { emptyForm } from "./formState";

afterEach(() => window.localStorage.clear());

describe("draftStorage", () => {
  it("保存した下書きを読み戻せる", () => {
    const form = { ...emptyForm("2026-10-05", "c1"), outcome: "rough" as const, memo: "途中" };
    saveDraft({ step: "form", form, initialPhotoIds: ["p1"] });
    expect(loadDraft()).toEqual({ step: "form", form, initialPhotoIds: ["p1"] });
  });

  it("clearDraft で消える", () => {
    saveDraft({ step: "form", form: emptyForm("2026-10-05", null), initialPhotoIds: [] });
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it("壊れた値や必要な項目が無い値は無いものとして扱う", () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, "{broken");
    expect(loadDraft()).toBeNull();
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ step: "form", form: {} }));
    expect(loadDraft()).toBeNull();
  });
});
