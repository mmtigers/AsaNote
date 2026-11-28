import { beforeEach, describe, expect, it, vi } from "vitest";

const { insertMock, fromMock, getUserMock } = vi.hoisted(() => {
  const insertMock = vi.fn();
  const fromMock = vi.fn(() => ({ insert: insertMock }));
  const getUserMock = vi.fn();
  return { insertMock, fromMock, getUserMock };
});

vi.mock("./supabase/client", () => ({
  getSupabaseClient: () => ({ from: fromMock, auth: { getUser: getUserMock } }),
}));

import { CONCERN_TITLE_MAX, RULE_TITLE_MAX, createBoardApi } from "./board";

const api = createBoardApi({ rules: "x_rules", concerns: "x_concerns" });

beforeEach(() => {
  vi.clearAllMocks();
  insertMock.mockResolvedValue({ error: null });
  getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
});

describe("createConcern(#298)", () => {
  it("渡されたテーブルに、対象の子どもを child_id として保存する", async () => {
    await api.createConcern({ title: " 朝の着替え ", childId: "c1" });
    expect(fromMock).toHaveBeenCalledWith("x_concerns");
    expect(insertMock).toHaveBeenCalledWith({ user_id: "u1", title: "朝の着替え", child_id: "c1" });
  });

  it("全員向けは child_id を null にする", async () => {
    await api.createConcern({ title: "運動会", childId: null });
    expect(insertMock).toHaveBeenCalledWith({ user_id: "u1", title: "運動会", child_id: null });
  });

  it("空・長すぎる内容は保存しない", async () => {
    await expect(api.createConcern({ title: "  ", childId: null })).rejects.toThrow("内容を入力してください");
    await expect(api.createConcern({ title: "あ".repeat(CONCERN_TITLE_MAX + 1), childId: null })).rejects.toThrow();
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe("createRule", () => {
  it("渡されたテーブルに、開始日と対象の子どもを付けて保存する", async () => {
    await api.createRule({ title: " 7時に起こす ", startedOn: "2026-11-01", childId: null });
    expect(fromMock).toHaveBeenCalledWith("x_rules");
    expect(insertMock).toHaveBeenCalledWith({ user_id: "u1", title: "7時に起こす", started_on: "2026-11-01", child_id: null });
  });

  it("開始日が無い・内容が長すぎるときは保存しない", async () => {
    await expect(api.createRule({ title: "a", startedOn: "", childId: null })).rejects.toThrow("開始日を入力してください");
    await expect(api.createRule({ title: "あ".repeat(RULE_TITLE_MAX + 1), startedOn: "2026-11-01", childId: null })).rejects.toThrow();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("ログインしていなければ保存しない", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    await expect(api.createRule({ title: "a", startedOn: "2026-11-01", childId: null })).rejects.toThrow("ログインが必要です");
    expect(insertMock).not.toHaveBeenCalled();
  });
});
