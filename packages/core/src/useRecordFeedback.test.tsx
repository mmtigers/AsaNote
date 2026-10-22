// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  fetchRecordFeedback: vi.fn(),
  markRecordRead: vi.fn(),
  saveRecordComment: vi.fn(),
  deleteRecordComment: vi.fn(),
}));

vi.mock("./auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("./recordFeedback", () => ({
  fetchRecordFeedback: mocks.fetchRecordFeedback,
  markRecordRead: mocks.markRecordRead,
  saveRecordComment: mocks.saveRecordComment,
  deleteRecordComment: mocks.deleteRecordComment,
}));

import { useRecordFeedback } from "./useRecordFeedback";

const TABLES = { reads: "record_reads", comments: "record_comments" };
const comment = (body: string) => ({ recordId: "r1", userId: "u1", body, createdAt: "c", updatedAt: "u" });

async function setup() {
  const hook = renderHook(() => useRecordFeedback(TABLES));
  await waitFor(() => expect(mocks.fetchRecordFeedback).toHaveBeenCalled());
  return hook;
}

describe("useRecordFeedback", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.useAuth.mockReturnValue({ session: { user: { id: "u1" } }, loading: false });
    mocks.fetchRecordFeedback.mockResolvedValue({ reads: [], comments: [] });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("ログイン中は印とコメントを取得する", async () => {
    mocks.fetchRecordFeedback.mockResolvedValue({
      reads: [{ recordId: "r1", userId: "u2", readAt: "t" }],
      comments: [comment("やあ")],
    });
    const { result } = await setup();
    await waitFor(() => expect(result.current.reads).toHaveLength(1));
    expect(result.current.comments).toEqual([comment("やあ")]);
    expect(mocks.fetchRecordFeedback).toHaveBeenCalledWith(TABLES);
  });

  it("未ログイン・認証の確定待ちの間は取得しない", () => {
    mocks.useAuth.mockReturnValue({ session: null, loading: false });
    renderHook(() => useRecordFeedback(TABLES));
    mocks.useAuth.mockReturnValue({ session: null, loading: true });
    renderHook(() => useRecordFeedback(TABLES));
    expect(mocks.fetchRecordFeedback).not.toHaveBeenCalled();
  });

  it("取得に失敗しても、画面にはエラーを出さず空のままにする", async () => {
    mocks.fetchRecordFeedback.mockRejectedValue(new Error("down"));
    const { result } = await setup();
    await act(async () => {});
    expect(result.current.reads).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  describe("markRead", () => {
    it("成功したら一覧に加える。すでにあれば増やさない", async () => {
      mocks.markRecordRead.mockResolvedValue({ recordId: "r1", userId: "u1", readAt: "t" });
      const { result } = await setup();
      await act(() => result.current.markRead("r1"));
      expect(mocks.markRecordRead).toHaveBeenCalledWith(TABLES, "r1", "u1");
      expect(result.current.reads).toHaveLength(1);
      await act(() => result.current.markRead("r1"));
      expect(result.current.reads).toHaveLength(1);
    });

    it("失敗したらエラー文を出し、一覧は変えない", async () => {
      mocks.markRecordRead.mockRejectedValue(new Error("rls"));
      const { result } = await setup();
      await act(() => result.current.markRead("r1"));
      expect(result.current.error).toEqual(expect.any(String));
      expect(result.current.reads).toEqual([]);
    });
  });

  describe("saveComment", () => {
    it("新規は一覧に加え、true を返す", async () => {
      mocks.saveRecordComment.mockResolvedValue(comment("新規"));
      const { result } = await setup();
      let ok = false;
      await act(async () => {
        ok = await result.current.saveComment("r1", "新規");
      });
      expect(ok).toBe(true);
      expect(mocks.saveRecordComment).toHaveBeenCalledWith(TABLES, undefined, "r1", "u1", "新規");
      expect(result.current.comments).toEqual([comment("新規")]);
    });

    it("編集は既存の行を置き換える(増やさない)", async () => {
      mocks.fetchRecordFeedback.mockResolvedValue({ reads: [], comments: [comment("前")] });
      const { result } = await setup();
      await waitFor(() => expect(result.current.comments).toHaveLength(1));
      mocks.saveRecordComment.mockResolvedValue(comment("後"));
      await act(() => result.current.saveComment("r1", "後"));
      expect(mocks.saveRecordComment).toHaveBeenCalledWith(TABLES, comment("前"), "r1", "u1", "後");
      expect(result.current.comments).toEqual([comment("後")]);
    });

    it("失敗したら false を返してエラー文を出し、一覧は変えない", async () => {
      mocks.saveRecordComment.mockRejectedValue(new Error("db"));
      const { result } = await setup();
      let ok = true;
      await act(async () => {
        ok = await result.current.saveComment("r1", "あ");
      });
      expect(ok).toBe(false);
      expect(result.current.error).toEqual(expect.any(String));
      expect(result.current.comments).toEqual([]);
    });
  });

  describe("deleteComment", () => {
    it("成功したら一覧から外す", async () => {
      mocks.fetchRecordFeedback.mockResolvedValue({ reads: [], comments: [comment("消す")] });
      mocks.deleteRecordComment.mockResolvedValue(undefined);
      const { result } = await setup();
      await waitFor(() => expect(result.current.comments).toHaveLength(1));
      await act(() => result.current.deleteComment("r1"));
      expect(mocks.deleteRecordComment).toHaveBeenCalledWith(TABLES, "r1", "u1");
      expect(result.current.comments).toEqual([]);
    });

    it("失敗したら一覧を残し、false を返す", async () => {
      mocks.fetchRecordFeedback.mockResolvedValue({ reads: [], comments: [comment("残る")] });
      mocks.deleteRecordComment.mockRejectedValue(new Error("rls"));
      const { result } = await setup();
      await waitFor(() => expect(result.current.comments).toHaveLength(1));
      let ok = true;
      await act(async () => {
        ok = await result.current.deleteComment("r1");
      });
      expect(ok).toBe(false);
      expect(result.current.comments).toHaveLength(1);
    });
  });
});
