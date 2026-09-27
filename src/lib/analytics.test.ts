import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const fromMock = vi.fn(() => ({ insert: insertMock }));
const getSupabaseClientMock = vi.fn(() => ({ from: fromMock }));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => getSupabaseClientMock(),
}));

const { track } = await import("./analytics");

beforeEach(() => {
  fromMock.mockClear();
  insertMock.mockReset();
  insertMock.mockReturnValue(Promise.resolve({ error: null }));
  getSupabaseClientMock.mockClear();
});

describe("track", () => {
  it("userIdが無ければ何もしない(未ログイン時はオフライン専用利用のため)", () => {
    track("record_flow_started", { entry_point: "home_start_button" }, { userId: null, recordId: "r1" });

    expect(getSupabaseClientMock).not.toHaveBeenCalled();
  });

  it("userIdがあればanalytics_eventsへinsertする", () => {
    track("record_saved", { is_edit: false }, { userId: "user-1", recordId: "r1" });

    expect(fromMock).toHaveBeenCalledWith("analytics_events");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        record_id: "r1",
        event_name: "record_saved",
        properties: { is_edit: false },
      })
    );
  });

  it("Supabase未設定(getSupabaseClientが例外を投げる)場合も例外を伝播させない", () => {
    getSupabaseClientMock.mockImplementationOnce(() => {
      throw new Error("Supabaseの環境変数が未設定です");
    });

    expect(() => track("record_saved", {}, { userId: "user-1", recordId: "r1" })).not.toThrow();
  });
});
