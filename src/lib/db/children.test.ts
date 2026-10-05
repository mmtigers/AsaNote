import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Child } from "@/types/models";
import { createChild, deleteChild, getChildren, resolveEffectiveChildId, updateChild } from "./children";

const authGetUser = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: { getUser: authGetUser },
    from: fromMock,
  }),
}));

function makeQueryBuilder(result: { data?: unknown; error?: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    order: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve(result)),
    then: (
      onFulfilled?: (value: typeof result) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return builder;
}

beforeEach(() => {
  authGetUser.mockReset();
  fromMock.mockReset();
  authGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("getChildren", () => {
  it("作成日時の昇順で取得する", async () => {
    const builder = makeQueryBuilder({ data: [{ id: "c1", name: "はな", created_by: "user-1", created_at: "x" }], error: null });
    fromMock.mockReturnValue(builder);

    const result = await getChildren();

    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(result).toEqual([{ id: "c1", name: "はな", created_by: "user-1", created_at: "x" }]);
  });

  it("dataがnullの場合は空配列を返す", async () => {
    fromMock.mockReturnValue(makeQueryBuilder({ data: null, error: null }));

    expect(await getChildren()).toEqual([]);
  });

  it("エラー時は例外を投げる", async () => {
    fromMock.mockReturnValue(makeQueryBuilder({ data: null, error: new Error("boom") }));

    await expect(getChildren()).rejects.toThrow("boom");
  });
});

describe("createChild", () => {
  it("名前をtrimしてinsertする", async () => {
    const child = { id: "c1", name: "はな", created_by: "user-1", created_at: "x" };
    const builder = makeQueryBuilder({ data: child, error: null });
    fromMock.mockReturnValue(builder);

    const result = await createChild("  はな  ");

    expect(builder.insert).toHaveBeenCalledWith({ name: "はな", created_by: "user-1" });
    expect(result).toEqual(child);
  });

  it("空文字はSupabaseを呼ばずにエラーにする", async () => {
    await expect(createChild("   ")).rejects.toThrow("名前を入力してください");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("51文字以上はSupabaseを呼ばずにエラーにする", async () => {
    await expect(createChild("あ".repeat(51))).rejects.toThrow("50文字以内");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("未ログインの場合はエラーを投げる", async () => {
    authGetUser.mockResolvedValue({ data: { user: null } });

    await expect(createChild("はな")).rejects.toThrow("ログインが必要です");
  });

  it("エラー時は例外を投げる", async () => {
    fromMock.mockReturnValue(makeQueryBuilder({ data: null, error: new Error("boom") }));

    await expect(createChild("はな")).rejects.toThrow("boom");
  });
});

describe("resolveEffectiveChildId", () => {
  const children: Child[] = [
    { id: "c1", name: "はな", created_by: "u1", created_at: "x" },
    { id: "c2", name: "たろう", created_by: "u1", created_at: "y" },
  ];

  it("子どもがnull(未取得/未ログイン)の場合はnullを返す", () => {
    expect(resolveEffectiveChildId(null, "c1")).toBeNull();
  });

  it("子どもが0〜1人の場合はnullを返す(機能を無効化)", () => {
    expect(resolveEffectiveChildId([], "c1")).toBeNull();
    expect(resolveEffectiveChildId([children[0]!], "c1")).toBeNull();
  });

  it("選択中のIDが子ども一覧に存在すればそれを返す", () => {
    expect(resolveEffectiveChildId(children, "c2")).toBe("c2");
  });

  it("選択中のIDが存在しない(未選択・削除済み)場合は先頭の子どもを返す", () => {
    expect(resolveEffectiveChildId(children, null)).toBe("c1");
    expect(resolveEffectiveChildId(children, "does-not-exist")).toBe("c1");
  });
});


describe("updateChild", () => {
  it("名前を trim して更新し、更新後の行を返す(#59)", async () => {
    const builder = makeQueryBuilder({ data: { id: "c1", name: "はなこ", created_by: "user-1", created_at: "x" }, error: null });
    fromMock.mockReturnValue(builder);

    const result = await updateChild("c1", "  はなこ  ");

    expect(builder.update).toHaveBeenCalledWith({ name: "はなこ" });
    expect(builder.eq).toHaveBeenCalledWith("id", "c1");
    expect(result.name).toBe("はなこ");
  });

  it("空の名前は拒否する", async () => {
    await expect(updateChild("c1", "   ")).rejects.toThrow("名前を入力してください");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("50文字を超える名前は拒否する", async () => {
    await expect(updateChild("c1", "あ".repeat(51))).rejects.toThrow("50文字以内");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("Supabase のエラーはそのまま投げる", async () => {
    fromMock.mockReturnValue(makeQueryBuilder({ data: null, error: new Error("rls denied") }));
    await expect(updateChild("c1", "はな")).rejects.toThrow("rls denied");
  });
});

describe("deleteChild", () => {
  it("id を指定して削除する(記録は on delete set null で残る)", async () => {
    const builder = makeQueryBuilder({ data: null, error: null });
    fromMock.mockReturnValue(builder);

    await deleteChild("c1");

    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith("id", "c1");
  });

  it("Supabase のエラーはそのまま投げる", async () => {
    fromMock.mockReturnValue(makeQueryBuilder({ data: null, error: new Error("rls denied") }));
    await expect(deleteChild("c1")).rejects.toThrow("rls denied");
  });
});
