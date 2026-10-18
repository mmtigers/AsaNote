import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ db: () => ({ rpc, from }) }));

import { createFamily, createInvite, fetchMyMembership, normalizeInviteCode, redeemInvite, removeMember, setMemberRole } from "./family";

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  rpc.mockResolvedValue({ data: "ok", error: null });
});

function memberQuery(result: { data: unknown; error: unknown }) {
  const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(result) };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  from.mockReturnValue(chain);
  return chain;
}

describe("normalizeInviteCode", () => {
  it("空白・ハイフンを除いて大文字にする", () => {
    expect(normalizeInviteCode(" abcd-2345 ")).toBe("ABCD2345");
    expect(normalizeInviteCode("ab cd 23 45")).toBe("ABCD2345");
  });
});

describe("RPC の呼び出し", () => {
  it("招待コードは正規化して送る", async () => {
    await redeemInvite("abcd-2345");
    expect(rpc).toHaveBeenCalledWith("redeem_oya_invite", { p_code: "ABCD2345" });
  });

  it("呼び名は前後の空白を除いて送る", async () => {
    await createFamily("  長男 ");
    expect(rpc).toHaveBeenCalledWith("create_oya_family", { p_display_name: "長男" });
    await createInvite("parent", " 父 ");
    expect(rpc).toHaveBeenCalledWith("create_oya_invite", { p_role: "parent", p_display_name: "父" });
  });

  it("メンバーの削除・役割の変更", async () => {
    await removeMember("u1");
    expect(rpc).toHaveBeenCalledWith("remove_oya_member", { p_user_id: "u1" });
    await setMemberRole("u1", "viewer");
    expect(rpc).toHaveBeenCalledWith("set_oya_member_role", { p_user_id: "u1", p_role: "viewer" });
  });

  it("サーバーのエラーは、そのまま投げる(画面で案内に変える)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "invite_invalid" } });
    await expect(redeemInvite("XXXXXXXX")).rejects.toEqual({ message: "invite_invalid" });
  });
});

describe("fetchMyMembership", () => {
  it("自分の行を、画面で使う形にする", async () => {
    const chain = memberQuery({
      data: { user_id: "u1", family_id: "f1", role: "parent", display_name: "父", joined_at: "2026-10-17T00:00:00Z" },
      error: null,
    });
    await expect(fetchMyMembership("u1")).resolves.toEqual({
      userId: "u1",
      familyId: "f1",
      role: "parent",
      displayName: "父",
      joinedAt: "2026-10-17T00:00:00Z",
    });
    expect(from).toHaveBeenCalledWith("oya_members");
    expect(chain.eq).toHaveBeenCalledWith("user_id", "u1");
  });

  it("家族に属していなければ null", async () => {
    memberQuery({ data: null, error: null });
    await expect(fetchMyMembership("u1")).resolves.toBeNull();
  });

  it("想定外の役割は、権限の狭い閲覧者として扱う", async () => {
    memberQuery({ data: { user_id: "u1", family_id: "f1", role: "owner", display_name: "?", joined_at: "" }, error: null });
    await expect(fetchMyMembership("u1")).resolves.toMatchObject({ role: "viewer" });
  });
});
