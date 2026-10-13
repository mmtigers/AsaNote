import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const fromMock = vi.fn(() => ({ insert: insertMock }));
const getSessionMock = vi.fn();
const getSupabaseClientMock = vi.fn(() => ({ from: fromMock, auth: { getSession: getSessionMock } }));

vi.mock("./supabase/client", () => ({
  getSupabaseClient: () => getSupabaseClientMock(),
}));

const { reportClientError, resetClientErrorReports } = await import("./clientErrors");

// fire-and-forget の Promise チェーンが流れ切るのを待つ。
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  resetClientErrorReports();
  fromMock.mockClear();
  insertMock.mockReset();
  insertMock.mockResolvedValue({ error: null });
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ data: { session: { user: { id: "user-1" } } } });
  getSupabaseClientMock.mockClear();
});

describe("reportClientError", () => {
  it("client_errors へ、ログイン中ならユーザーID付きで insert する", async () => {
    reportClientError("asa", "window-error", new Error("boom"), "1.2.3");
    await flush();

    expect(fromMock).toHaveBeenCalledWith("client_errors");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        app: "asa",
        source: "window-error",
        message: "boom",
        app_version: "1.2.3",
        user_id: "user-1",
      })
    );
  });

  it("未ログインなら user_id は null", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });

    reportClientError("yoru", "unhandled-rejection", "oops");
    await flush();

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "oops", stack: null, user_id: null })
    );
  });

  it("DBの制約を超える長さは切り詰める", async () => {
    const error = new Error("a".repeat(5000));
    error.stack = "b".repeat(20000);

    reportClientError("asa", "error-boundary", error);
    await flush();

    const row = insertMock.mock.calls[0]?.[0];
    expect(row?.message).toHaveLength(1000);
    expect(row?.stack).toHaveLength(8000);
  });

  it("同じエラーは1回しか送らない", async () => {
    const error = new Error("same");
    reportClientError("asa", "window-error", error);
    reportClientError("asa", "window-error", error);
    await flush();

    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("1ページ読み込みあたり10件までしか送らない", async () => {
    for (let i = 0; i < 15; i++) reportClientError("asa", "window-error", new Error(`e${i}`));
    await flush();

    expect(insertMock).toHaveBeenCalledTimes(10);
  });

  describe("送信の上限は source ごとに分ける(#214)", () => {
    const sentSources = () => insertMock.mock.calls.map((call) => call[0]?.source);
    const countOf = (source: string) => sentSources().filter((s) => s === source).length;

    it("sync-failure は5件まで", async () => {
      for (let i = 0; i < 9; i++) reportClientError("asa", "sync-failure", new Error(`s${i}`));
      await flush();

      expect(countOf("sync-failure")).toBe(5);
    });

    it("local-db は1件まで", async () => {
      reportClientError("yoru", "local-db", new Error("l0"));
      reportClientError("yoru", "local-db", new Error("l1"));
      await flush();

      expect(countOf("local-db")).toBe(1);
    });

    it("想定外エラー系(error-boundary / window-error / unhandled-rejection)は合わせて10件まで", async () => {
      const sources = ["error-boundary", "window-error", "unhandled-rejection"] as const;
      for (let i = 0; i < 14; i++) reportClientError("asa", sources[i % 3] ?? "window-error", new Error(`u${i}`));
      await flush();

      expect(insertMock).toHaveBeenCalledTimes(10);
    });

    it("同期失敗が枠を使い切っても、あとから起きた想定外エラーは送られる", async () => {
      for (let i = 0; i < 9; i++) reportClientError("asa", "sync-failure", new Error(`s${i}`));
      reportClientError("asa", "error-boundary", new Error("render failed"));
      reportClientError("asa", "window-error", new Error("late error"));
      await flush();

      expect(countOf("sync-failure")).toBe(5);
      expect(countOf("error-boundary")).toBe(1);
      expect(countOf("window-error")).toBe(1);
    });

    it("想定外エラーが枠を使い切っても、同期失敗と端末DB不可は送られる", async () => {
      for (let i = 0; i < 12; i++) reportClientError("asa", "window-error", new Error(`u${i}`));
      reportClientError("asa", "sync-failure", new Error("sync"));
      reportClientError("asa", "local-db", new Error("db"));
      await flush();

      expect(countOf("window-error")).toBe(10);
      expect(countOf("sync-failure")).toBe(1);
      expect(countOf("local-db")).toBe(1);
    });

    it("1ページの最大は 10 + 5 + 1 = 16 件", async () => {
      for (let i = 0; i < 20; i++) reportClientError("asa", "window-error", new Error(`u${i}`));
      for (let i = 0; i < 20; i++) reportClientError("asa", "sync-failure", new Error(`s${i}`));
      for (let i = 0; i < 20; i++) reportClientError("asa", "local-db", new Error(`l${i}`));
      await flush();

      expect(insertMock).toHaveBeenCalledTimes(16);
    });
  });

  describe("sync-failure の重複判定は context.phase を含む(#214)", () => {
    it("同じ文言でも phase が違えば別のエラーとして送る", async () => {
      const error = new Error("permission denied");
      reportClientError("asa", "sync-failure", error, "1.0.0", { phase: "push-records-bulk" });
      reportClientError("asa", "sync-failure", error, "1.0.0", { phase: "pull-page" });
      await flush();

      expect(insertMock).toHaveBeenCalledTimes(2);
    });

    it("同じ文言で phase も同じなら1回だけ(count が違っても)", async () => {
      const error = new Error("permission denied");
      reportClientError("asa", "sync-failure", error, "1.0.0", { phase: "push-records-bulk", count: 3 });
      reportClientError("asa", "sync-failure", error, "1.0.0", { phase: "push-records-bulk", count: 4 });
      await flush();

      expect(insertMock).toHaveBeenCalledTimes(1);
    });

    it("sync-failure 以外は、context の phase が違っても同じエラーは1回だけ", async () => {
      const error = new Error("same");
      reportClientError("asa", "window-error", error, "1.0.0", { phase: "a" });
      reportClientError("asa", "window-error", error, "1.0.0", { phase: "b" });
      await flush();

      expect(insertMock).toHaveBeenCalledTimes(1);
    });
  });

  it("Supabase未設定や送信失敗でも例外を伝播させない", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    getSupabaseClientMock.mockImplementationOnce(() => {
      throw new Error("Supabaseの環境変数が未設定です");
    });
    expect(() => reportClientError("asa", "window-error", new Error("a"))).not.toThrow();

    insertMock.mockRejectedValueOnce(new Error("network"));
    expect(() => reportClientError("asa", "window-error", new Error("b"))).not.toThrow();
    await flush();
  });

  it("付帯情報(context)にオンライン状態と呼び出し側の値を入れる", async () => {
    reportClientError("asa", "sync-failure", new Error("sync"), "1.0.0", { phase: "push-records-bulk", count: 3 });
    await flush();

    const row = insertMock.mock.calls[0]?.[0];
    expect(row?.source).toBe("sync-failure");
    expect(row?.context).toEqual(expect.objectContaining({ phase: "push-records-bulk", count: 3 }));
    expect(row?.context).toHaveProperty("online");
  });

  it("Error でないオブジェクト(PostgrestError など)も message と code を残す", async () => {
    reportClientError("yoru", "sync-failure", { message: "permission denied", code: "42501", details: "", hint: "check RLS" });
    await flush();

    expect(insertMock.mock.calls[0]?.[0]?.message).toBe("permission denied | 42501 | check RLS");
  });
});
