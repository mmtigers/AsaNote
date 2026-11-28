import { beforeEach, describe, expect, it, vi } from "vitest";

const { insertMock, fromMock, getUserMock } = vi.hoisted(() => {
  const insertMock = vi.fn();
  const fromMock = vi.fn(() => ({ insert: insertMock }));
  const getUserMock = vi.fn();
  return { insertMock, fromMock, getUserMock };
});

vi.mock("@note/core/supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock, auth: { getUser: getUserMock } }),
}));

import { CONCERN_TITLE_MAX, createConcern } from "./board";

beforeEach(() => {
  vi.clearAllMocks();
  insertMock.mockResolvedValue({ error: null });
  getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
});

describe("createConcern(#298)", () => {
  it("対象の子どもを child_id として保存する", async () => {
    await createConcern({ title: " 朝の着替え ", childId: "c1" });
    expect(fromMock).toHaveBeenCalledWith("evening_concerns");
    expect(insertMock).toHaveBeenCalledWith({ user_id: "u1", title: "朝の着替え", child_id: "c1" });
  });

  it("全員向けは child_id を null にする", async () => {
    await createConcern({ title: "運動会", childId: null });
    expect(insertMock).toHaveBeenCalledWith({ user_id: "u1", title: "運動会", child_id: null });
  });

  it("空・長すぎる内容は保存しない", async () => {
    await expect(createConcern({ title: "  ", childId: null })).rejects.toThrow("内容を入力してください");
    await expect(createConcern({ title: "あ".repeat(CONCERN_TITLE_MAX + 1), childId: null })).rejects.toThrow();
    expect(insertMock).not.toHaveBeenCalled();
  });
});
