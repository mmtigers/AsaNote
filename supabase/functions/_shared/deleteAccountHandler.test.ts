// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIRM_PHRASE, PHOTO_BATCH, runDeleteAccount, type DeleteAccountStore } from "./deleteAccountHandler";

function makeStore(photoCount = 2) {
  const calls: string[] = [];
  const removed: string[][] = [];
  const store: DeleteAccountStore = {
    photoPaths: vi.fn(async (userId: string) => {
      calls.push(`photoPaths:${userId}`);
      return Array.from({ length: photoCount }, (_, i) => `${userId}/r1/p${i}.jpg`);
    }),
    removePhotos: vi.fn(async (paths: string[]) => {
      calls.push("removePhotos");
      removed.push(paths);
    }),
    leaveGroup: vi.fn(async (userId: string) => {
      calls.push(`leaveGroup:${userId}`);
    }),
    deleteUser: vi.fn(async (userId: string) => {
      calls.push(`deleteUser:${userId}`);
    }),
  };
  return { store, calls, removed };
}

describe("runDeleteAccount(退会。#290)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("写真の実体 → グループの所属 → アカウントの順に消す(子どもの引き継ぎを連鎖削除の順序に頼らない)", async () => {
    const { store, calls } = makeStore();
    await expect(runDeleteAccount(store, "u1", CONFIRM_PHRASE)).resolves.toEqual({ ok: true });
    expect(calls).toEqual(["photoPaths:u1", "removePhotos", "leaveGroup:u1", "deleteUser:u1"]);
  });

  it("確認の文言が違えば、何も消さない", async () => {
    const { store, calls } = makeStore();
    for (const confirm of [undefined, "", "退会", " 退会する", 1]) {
      const result = await runDeleteAccount(store, "u1", confirm);
      expect(result).toMatchObject({ ok: false, code: "bad_request" });
    }
    expect(calls).toEqual([]);
  });

  it("写真が無ければ Storage の削除は呼ばない", async () => {
    const { store, calls } = makeStore(0);
    await runDeleteAccount(store, "u1", CONFIRM_PHRASE);
    expect(calls).toEqual(["photoPaths:u1", "leaveGroup:u1", "deleteUser:u1"]);
  });

  it("写真が多ければ、分けて消す", async () => {
    const { store, removed } = makeStore(PHOTO_BATCH * 2 + 1);
    await runDeleteAccount(store, "u1", CONFIRM_PHRASE);
    expect(removed.map((r) => r.length)).toEqual([PHOTO_BATCH, PHOTO_BATCH, 1]);
  });

  it("写真を消せなければ、グループの所属もアカウントも消さない(写真の実体を残したまま消さない)", async () => {
    const { store, calls } = makeStore();
    vi.mocked(store.removePhotos).mockRejectedValue(new Error("storage"));
    await expect(runDeleteAccount(store, "u1", CONFIRM_PHRASE)).resolves.toMatchObject({ ok: false, code: "failed" });
    expect(calls).not.toContain("leaveGroup:u1");
    expect(calls).not.toContain("deleteUser:u1");
  });

  it("グループから抜けられなければ、アカウントは消さない", async () => {
    const { store, calls } = makeStore();
    vi.mocked(store.leaveGroup).mockRejectedValue(new Error("db"));
    await expect(runDeleteAccount(store, "u1", CONFIRM_PHRASE)).resolves.toMatchObject({ ok: false, code: "failed" });
    expect(calls).not.toContain("deleteUser:u1");
  });

  it("失敗のログに、利用者の ID やエラーの本文を出さない", async () => {
    const { store } = makeStore();
    vi.mocked(store.deleteUser).mockRejectedValue(new Error("user u1 secret detail"));
    await runDeleteAccount(store, "u1", CONFIRM_PHRASE);
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain("u1");
    expect(logged).not.toContain("secret");
  });
});
