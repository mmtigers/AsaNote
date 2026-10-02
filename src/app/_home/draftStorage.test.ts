/**
 * Issue #60: `draftStorage.ts` はカバレッジ 0% だった。
 *
 * 「記録の途中で他の画面を見に行っても入力が消えない」という体験そのものを
 * 担っており、壊れても画面はエラーにならず**黙って下書きが消えるだけ**なので、
 * 気づきにくい。保存・復元・破棄と、購読者への通知を固定する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DRAFT_STORAGE_KEY } from "@/lib/draft";
import type { Draft } from "./types";
import { clearDraft, loadDraft, saveDraft } from "./draftStorage";

const draft = (overrides: Partial<Draft> = {}): Draft =>
  ({
    date: "2026-09-14",
    step: "result",
    form: {
      id: "r1",
      outcome: "reluctant",
      reasonTags: ["眠い・疲れ"],
      departTime: "08:20",
      memo: "少しぐずった",
      wakeTime: "07:15",
      wakeTags: [],
      triggerTags: [],
      responseTags: [],
      companion: "",
      handoff: "",
    },
    ...overrides,
  }) as Draft;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveDraft / loadDraft", () => {
  it("保存した下書きをそのまま読み戻せる", () => {
    const d = draft();

    saveDraft(d);

    expect(loadDraft()).toEqual(d);
  });

  it("下書きが無ければnullを返す", () => {
    expect(loadDraft()).toBeNull();
  });

  it("保存するとBottomNavなどの購読者へ通知が飛ぶ", () => {
    // 通知が飛ばないと「記録する」タブの再開バッジが出ない。
    const listener = vi.fn();
    window.addEventListener("asa-note:draft-changed", listener);

    saveDraft(draft());

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("asa-note:draft-changed", listener);
  });

  it("上書き保存すると新しい内容になる", () => {
    saveDraft(draft());
    saveDraft(draft({ step: "reason" }));

    expect(loadDraft()?.step).toBe("reason");
  });
});

describe("clearDraft", () => {
  it("破棄するとnullに戻る", () => {
    saveDraft(draft());

    clearDraft();

    expect(loadDraft()).toBeNull();
  });

  it("破棄でも購読者へ通知が飛ぶ(バッジを消すため)", () => {
    saveDraft(draft());
    const listener = vi.fn();
    window.addEventListener("asa-note:draft-changed", listener);

    clearDraft();

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("asa-note:draft-changed", listener);
  });

  it("下書きが無い状態で呼んでも落ちない", () => {
    expect(() => clearDraft()).not.toThrow();
  });
});

describe("壊れた/読めない値の扱い", () => {
  it("JSONとして壊れていればnullを返す(画面を落とさない)", () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, "{壊れたJSON");

    expect(loadDraft()).toBeNull();
  });

  it("読めない環境(プライベートブラウジング等)ではnullを返す", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(loadDraft()).toBeNull();
  });

  it("書けない環境でもthrowしない(入力自体は継続できる)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => saveDraft(draft())).not.toThrow();
  });

  it("消せない環境でもthrowしない", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => clearDraft()).not.toThrow();
  });
});
