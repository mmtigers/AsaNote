import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMemberEmailMap,
  createGroup,
  createInvite,
  getActiveInvite,
  getGroupMembers,
  getMyGroup,
  joinGroupByCode,
  leaveGroup,
} from "./groups";

const authGetUser = vi.fn();
const fromMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@note/core/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: { getUser: authGetUser },
    from: fromMock,
    rpc: rpcMock,
  }),
}));

// supabase-jsのクエリビルダーはメソッドチェイン可能かつ、それ自体awaitすると
// {data, error}に解決される("thenable")。実装がmaybeSingle()/single()を呼ぶ箇所と
// 呼ばずに直接awaitする箇所の両方があるため、両対応のフェイクを用意する。
function makeQueryBuilder(result: { data?: unknown; error?: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    gt: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
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
  rpcMock.mockReset();
  authGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("getMyGroup", () => {
  it("未所属の場合はnullを返す", async () => {
    fromMock.mockReturnValue(makeQueryBuilder({ data: null, error: null }));

    expect(await getMyGroup()).toBeNull();
  });

  it("所属グループがあれば返す", async () => {
    const group = { id: "g1", name: null, created_by: "user-1", created_at: "2026-09-14T00:00:00.000Z" };
    fromMock.mockReturnValue(makeQueryBuilder({ data: { groups: group }, error: null }));

    expect(await getMyGroup()).toEqual(group);
  });

  it("groupsが配列で返っても先頭要素を返す", async () => {
    const group = { id: "g1", name: null, created_by: "user-1", created_at: "2026-09-14T00:00:00.000Z" };
    fromMock.mockReturnValue(makeQueryBuilder({ data: { groups: [group] }, error: null }));

    expect(await getMyGroup()).toEqual(group);
  });

  it("エラー時は例外を投げる", async () => {
    fromMock.mockReturnValue(makeQueryBuilder({ data: null, error: new Error("boom") }));

    await expect(getMyGroup()).rejects.toThrow("boom");
  });

  it("未ログインの場合はエラーを投げる", async () => {
    authGetUser.mockResolvedValue({ data: { user: null } });

    await expect(getMyGroup()).rejects.toThrow("ログインが必要です");
  });
});

describe("createGroup", () => {
  it("成功時はグループを返す", async () => {
    const group = { id: "g1", name: null, created_by: "user-1", created_at: "x" };
    rpcMock.mockResolvedValue({ data: group, error: null });

    expect(await createGroup()).toEqual(group);
  });

  it("既に所属している場合は分かりやすいメッセージにする", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "already_in_group" } });

    await expect(createGroup()).rejects.toThrow("既にグループに所属しています");
  });

  it("想定外のエラーはそのまま投げる", async () => {
    const err = { message: "unexpected" };
    rpcMock.mockResolvedValue({ data: null, error: err });

    await expect(createGroup()).rejects.toBe(err);
  });
});

describe("getActiveInvite", () => {
  it("有効な招待がなければnullを返す", async () => {
    fromMock.mockReturnValue(makeQueryBuilder({ data: null, error: null }));

    expect(await getActiveInvite("g1")).toBeNull();
  });

  it("有効な招待があれば返す", async () => {
    const invite = {
      id: "inv1",
      group_id: "g1",
      code: "ABCD1234",
      created_by: "user-1",
      expires_at: "x",
      used_at: null,
      used_by: null,
      created_at: "x",
    };
    fromMock.mockReturnValue(makeQueryBuilder({ data: invite, error: null }));

    expect(await getActiveInvite("g1")).toEqual(invite);
  });
});

describe("createInvite", () => {
  it("8桁の招待コードを生成してinsertする", async () => {
    const invite = {
      id: "inv1",
      group_id: "g1",
      code: "X",
      created_by: "user-1",
      expires_at: "x",
      used_at: null,
      used_by: null,
      created_at: "x",
    };
    const builder = makeQueryBuilder({ data: invite, error: null });
    fromMock.mockReturnValue(builder);

    const result = await createInvite("g1");

    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        group_id: "g1",
        created_by: "user-1",
        code: expect.stringMatching(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/),
      })
    );
    expect(result).toEqual(invite);
  });
});

describe("joinGroupByCode", () => {
  it("空文字はSupabaseを呼ばずにエラーにする", async () => {
    await expect(joinGroupByCode("   ")).rejects.toThrow("招待コードを入力してください");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("コードを整形(trim・大文字化)してRPCへ渡す", async () => {
    rpcMock.mockResolvedValue({ data: "g1", error: null });

    await joinGroupByCode("  abcd1234  ");

    expect(rpcMock).toHaveBeenCalledWith("redeem_group_invite", { p_code: "ABCD1234" });
  });

  it("無効な招待コードは分かりやすいメッセージにする", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "invite_invalid" } });

    await expect(joinGroupByCode("ABCD1234")).rejects.toThrow("招待コードが無効か、期限切れです");
  });

  it("既に所属している場合は分かりやすいメッセージにする", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "already_in_group" } });

    await expect(joinGroupByCode("ABCD1234")).rejects.toThrow("既にグループに所属しています");
  });

  it("想定外のエラーはそのまま投げる", async () => {
    const err = { message: "unexpected" };
    rpcMock.mockResolvedValue({ data: null, error: err });

    await expect(joinGroupByCode("ABCD1234")).rejects.toBe(err);
  });
});

describe("leaveGroup", () => {
  it("自分のuser_idの行だけ削除する", async () => {
    const builder = makeQueryBuilder({ error: null });
    fromMock.mockReturnValue(builder);

    await leaveGroup();

    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("削除に失敗したら例外を投げる", async () => {
    fromMock.mockReturnValue(makeQueryBuilder({ error: new Error("boom") }));

    await expect(leaveGroup()).rejects.toThrow("boom");
  });
});

describe("getGroupMembers", () => {
  it("RPCの結果を返す", async () => {
    const members = [{ user_id: "user-1", email: "a@example.com", joined_at: "x" }];
    rpcMock.mockResolvedValue({ data: members, error: null });

    expect(await getGroupMembers()).toEqual(members);
  });

  it("dataがnullの場合は空配列を返す", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    expect(await getGroupMembers()).toEqual([]);
  });

  it("エラー時は例外を投げる", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("boom") });

    await expect(getGroupMembers()).rejects.toThrow("boom");
  });
});

describe("buildMemberEmailMap", () => {
  it("メンバー一覧からuser_id→emailのMapを作る", () => {
    const map = buildMemberEmailMap([
      { user_id: "u1", email: "a@example.com", joined_at: "x" },
      { user_id: "u2", email: null, joined_at: "x" },
    ]);

    expect(map.get("u1")).toBe("a@example.com");
    expect(map.get("u2")).toBeNull();
  });

  it("nullの場合は空のMapを返す", () => {
    expect(buildMemberEmailMap(null).size).toBe(0);
  });
});
