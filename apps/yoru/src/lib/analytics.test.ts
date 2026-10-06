import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
const from = vi.fn(() => ({ insert }));
let clientError: Error | null = null;
vi.mock("@note/core/supabase/client", () => ({
  getSupabaseClient: () => {
    if (clientError) throw clientError;
    return { from };
  },
}));

import { track } from "./analytics";

beforeEach(() => {
  clientError = null;
  insert.mockReset().mockResolvedValue({ error: null });
  from.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("track", () => {
  it("未ログインなら何も送らない", () => {
    track("evening_record_saved", {}, { userId: null, recordId: "r1" });
    expect(from).not.toHaveBeenCalled();
  });

  it("analytics_events へ evening_ 始まりのイベントとして1行 insert する", () => {
    track("evening_record_saved", { outcome: "calm" }, { userId: "u1", recordId: "r1" });
    expect(from).toHaveBeenCalledWith("analytics_events");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "u1",
        record_id: "r1",
        event_name: "evening_record_saved",
        properties: { outcome: "calm" },
      })
    );
  });

  it("クライアントの生成・送信が失敗しても例外を投げない", async () => {
    clientError = new Error("no env");
    expect(() => track("evening_record_saved", {}, { userId: "u1", recordId: "r1" })).not.toThrow();
    clientError = null;
    insert.mockRejectedValue(new Error("network"));
    expect(() => track("evening_record_saved", {}, { userId: "u1", recordId: "r1" })).not.toThrow();
    await Promise.resolve();
  });
});
