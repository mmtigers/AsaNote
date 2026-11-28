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

import { boardApi } from "./board";

beforeEach(() => {
  vi.clearAllMocks();
  insertMock.mockResolvedValue({ error: null });
  getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
});

// 読み書きの手順は @note/core/board のテストで固定している。ここではよるノートのテーブルを使うことだけを確かめる。
describe("boardApi(よるノート)", () => {
  it("試したことは evening_rules、検討事項は evening_concerns に保存する", async () => {
    await boardApi.createRule({ title: "18時までにお風呂", startedOn: "2026-10-01", childId: null });
    expect(fromMock).toHaveBeenLastCalledWith("evening_rules");
    await boardApi.createConcern({ title: "朝の着替え", childId: "c1" });
    expect(fromMock).toHaveBeenLastCalledWith("evening_concerns");
    expect(insertMock).toHaveBeenLastCalledWith({ user_id: "u1", title: "朝の着替え", child_id: "c1" });
  });
});
