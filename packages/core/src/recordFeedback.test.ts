import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMMENT_MAX_LENGTH,
  deleteRecordComment,
  fetchRecordFeedback,
  markRecordRead,
  normalizeCommentBody,
  saveRecordComment,
  type RecordComment,
} from "./recordFeedback";

const fromMock = vi.fn();
vi.mock("./supabase/client", () => ({ getSupabaseClient: () => ({ from: fromMock }) }));

const TABLES = { reads: "record_reads", comments: "record_comments" };

// メソッドチェイン可能で、awaitすると {data, error} に解決されるフェイク(groups.test.ts と同じ形)。
function makeBuilder(result: { data?: unknown; error?: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    then: (onFulfilled?: (v: typeof result) => unknown, onRejected?: (r: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return builder;
}

beforeEach(() => {
  fromMock.mockReset();
});

describe("normalizeCommentBody", () => {
  it("前後の空白を除く", () => {
    expect(normalizeCommentBody("  ありがとう \n")).toBe("ありがとう");
  });

  it("空・空白だけ・上限超えは null", () => {
    expect(normalizeCommentBody("")).toBeNull();
    expect(normalizeCommentBody("   ")).toBeNull();
    expect(normalizeCommentBody("あ".repeat(COMMENT_MAX_LENGTH + 1))).toBeNull();
  });

  it("上限ちょうどは通す", () => {
    const body = "あ".repeat(COMMENT_MAX_LENGTH);
    expect(normalizeCommentBody(body)).toBe(body);
  });
});

describe("fetchRecordFeedback", () => {
  it("読んだ印とコメントを、アプリ内の形(camelCase)で返す", async () => {
    const reads = makeBuilder({ data: [{ record_id: "r1", user_id: "u1", read_at: "2026-10-22T08:30:00Z" }], error: null });
    const comments = makeBuilder({
      data: [{ record_id: "r1", user_id: "u2", body: "おつかれさま", created_at: "c", updated_at: "u" }],
      error: null,
    });
    fromMock.mockImplementation((table: string) => (table === "record_reads" ? reads : comments));

    const result = await fetchRecordFeedback(TABLES);

    expect(result.reads).toEqual([{ recordId: "r1", userId: "u1", readAt: "2026-10-22T08:30:00Z" }]);
    expect(result.comments).toEqual([
      { recordId: "r1", userId: "u2", body: "おつかれさま", createdAt: "c", updatedAt: "u" },
    ]);
  });

  it("1ページに収まらない分は、次のページを続けて取る", async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({ record_id: `r${i}`, user_id: "u1", read_at: "t" }));
    const first = makeBuilder({ data: fullPage, error: null });
    const second = makeBuilder({ data: [{ record_id: "last", user_id: "u1", read_at: "t" }], error: null });
    const commentsEmpty = makeBuilder({ data: [], error: null });
    const readPages = [first, second];
    fromMock.mockImplementation((table: string) => (table === "record_reads" ? readPages.shift()! : commentsEmpty));

    const { reads } = await fetchRecordFeedback(TABLES);

    expect(reads).toHaveLength(1001);
    expect(first.range).toHaveBeenCalledWith(0, 999);
    expect(second.range).toHaveBeenCalledWith(1000, 1999);
  });

  it("取得に失敗したら例外にする", async () => {
    fromMock.mockReturnValue(makeBuilder({ data: null, error: new Error("rls") }));
    await expect(fetchRecordFeedback(TABLES)).rejects.toThrow("rls");
  });
});

describe("markRecordRead", () => {
  it("すでに押していても上書きしない(最初の日時を残す)upsertで保存する", async () => {
    const builder = makeBuilder({ error: null });
    fromMock.mockReturnValue(builder);

    const read = await markRecordRead(TABLES, "r1", "u1");

    expect(fromMock).toHaveBeenCalledWith("record_reads");
    expect(builder.upsert).toHaveBeenCalledWith(
      { record_id: "r1", user_id: "u1", read_at: read.readAt },
      { onConflict: "record_id,user_id", ignoreDuplicates: true }
    );
    expect(read).toMatchObject({ recordId: "r1", userId: "u1" });
  });

  it("保存に失敗したら例外にする", async () => {
    fromMock.mockReturnValue(makeBuilder({ error: new Error("rls") }));
    await expect(markRecordRead(TABLES, "r1", "u1")).rejects.toThrow("rls");
  });
});

describe("saveRecordComment", () => {
  const existing: RecordComment = {
    recordId: "r1",
    userId: "u1",
    body: "前の文",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  };

  it("新規は insert。本文は前後の空白を除いて保存する", async () => {
    const builder = makeBuilder({ error: null });
    fromMock.mockReturnValue(builder);

    const saved = await saveRecordComment(TABLES, undefined, "r1", "u1", "  読んだよ ");

    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({ record_id: "r1", user_id: "u1", body: "読んだよ" }));
    expect(saved).toMatchObject({ recordId: "r1", userId: "u1", body: "読んだよ" });
  });

  it("編集は update。作成日時は変えず、本人の行だけを対象にする", async () => {
    const builder = makeBuilder({ error: null });
    fromMock.mockReturnValue(builder);

    const saved = await saveRecordComment(TABLES, existing, "r1", "u1", "直した");

    expect(builder.update).toHaveBeenCalledWith({ body: "直した", updated_at: saved.updatedAt });
    expect(builder.eq).toHaveBeenCalledWith("record_id", "r1");
    expect(builder.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(saved.createdAt).toBe(existing.createdAt);
    expect(builder.insert).not.toHaveBeenCalled();
  });

  it("空の本文は DB に送らず例外にする", async () => {
    await expect(saveRecordComment(TABLES, undefined, "r1", "u1", "   ")).rejects.toThrow();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("保存に失敗したら例外にする", async () => {
    fromMock.mockReturnValue(makeBuilder({ error: new Error("db") }));
    await expect(saveRecordComment(TABLES, undefined, "r1", "u1", "あ")).rejects.toThrow("db");
  });
});

describe("deleteRecordComment", () => {
  it("記録と本人で絞って削除する", async () => {
    const builder = makeBuilder({ error: null });
    fromMock.mockReturnValue(builder);

    await deleteRecordComment(TABLES, "r1", "u1");

    expect(fromMock).toHaveBeenCalledWith("record_comments");
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith("record_id", "r1");
    expect(builder.eq).toHaveBeenCalledWith("user_id", "u1");
  });

  it("削除に失敗したら例外にする", async () => {
    fromMock.mockReturnValue(makeBuilder({ error: new Error("rls") }));
    await expect(deleteRecordComment(TABLES, "r1", "u1")).rejects.toThrow("rls");
  });
});
