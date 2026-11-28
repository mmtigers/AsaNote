import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getChildren: vi.fn(), from: vi.fn() }));
vi.mock("@note/core/db/children", () => ({ getChildren: mocks.getChildren }));
vi.mock("@note/core/supabase/client", () => ({ getSupabaseClient: () => ({ from: mocks.from }) }));

import { defaultMuseumName, getChildProfiles, museumNameOf, saveChildProfile, validateChildProfile } from "./childProfiles";

const TODAY = "2026-11-28";
const hana = { id: "c1", name: "はな", created_by: "u1", created_at: "x", birth_date: "2021-08-20" };

beforeEach(() => {
  mocks.getChildren.mockReset();
  mocks.from.mockReset();
});

describe("館の名前", () => {
  it("設定が無ければ「〇〇ちゃん美術館」", () => {
    expect(defaultMuseumName("はな")).toBe("はなちゃん美術館");
    expect(museumNameOf({ name: "はな", museum_name: null })).toBe("はなちゃん美術館");
    expect(museumNameOf({ name: "はな", museum_name: "  " })).toBe("はなちゃん美術館");
    expect(museumNameOf({ name: "はな", museum_name: "HANA MUSEUM" })).toBe("HANA MUSEUM");
  });
});

describe("getChildProfiles", () => {
  it("子どもの一覧に、館の名前を付けて返す", async () => {
    mocks.getChildren.mockResolvedValue([hana, { ...hana, id: "c2", name: "そうた" }]);
    const inFn = vi.fn().mockResolvedValue({ data: [{ child_id: "c1", museum_name: "HANA MUSEUM" }], error: null });
    mocks.from.mockReturnValue({ select: () => ({ in: inFn }) });

    const result = await getChildProfiles();
    expect(result.map((c) => [c.name, c.museum_name])).toEqual([
      ["はな", "HANA MUSEUM"],
      ["そうた", null],
    ]);
    expect(inFn).toHaveBeenCalledWith("child_id", ["c1", "c2"]);
  });

  it("子どもがいなければ、設定は読まない", async () => {
    mocks.getChildren.mockResolvedValue([]);
    expect(await getChildProfiles()).toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("validateChildProfile", () => {
  const ok = { name: "はな", birthDate: "2021-08-20", museumName: "" };

  it("正しい入力なら null", () => {
    expect(validateChildProfile(ok, TODAY)).toBeNull();
    expect(validateChildProfile({ ...ok, birthDate: "" }, TODAY)).toBeNull();
    expect(validateChildProfile({ ...ok, birthDate: TODAY }, TODAY)).toBeNull();
  });

  it("名前が空・長すぎる、誕生日が未来、館の名前が長すぎる", () => {
    expect(validateChildProfile({ ...ok, name: "  " }, TODAY)).toBe("名前を入力してください");
    expect(validateChildProfile({ ...ok, name: "あ".repeat(51) }, TODAY)).toContain("50文字以内");
    expect(validateChildProfile({ ...ok, birthDate: "2026-11-29" }, TODAY)).toBe("誕生日に未来の日付は入れられません");
    expect(validateChildProfile({ ...ok, museumName: "あ".repeat(31) }, TODAY)).toContain("30文字以内");
  });
});

describe("saveChildProfile", () => {
  it("名前・誕生日は children へ、館の名前は sakuhin_child_settings へ保存する(空は null)", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mocks.from.mockImplementation((table: string) => (table === "children" ? { update } : { upsert }));

    await saveChildProfile("c1", { name: " はな ", birthDate: "", museumName: " " }, TODAY);

    expect(update).toHaveBeenCalledWith({ name: "はな", birth_date: null });
    expect(eq).toHaveBeenCalledWith("id", "c1");
    expect(upsert).toHaveBeenCalledWith({ child_id: "c1", museum_name: null }, { onConflict: "child_id" });
  });

  it("入力に問題があれば、保存せずにメッセージを投げる", async () => {
    await expect(saveChildProfile("c1", { name: "", birthDate: "", museumName: "" }, TODAY)).rejects.toThrow("名前を入力してください");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("サーバーのエラーはそのまま投げる", async () => {
    const eq = vi.fn().mockResolvedValue({ error: new Error("rls denied") });
    mocks.from.mockReturnValue({ update: () => ({ eq }) });
    await expect(saveChildProfile("c1", { name: "はな", birthDate: "", museumName: "" }, TODAY)).rejects.toThrow("rls denied");
  });
});
