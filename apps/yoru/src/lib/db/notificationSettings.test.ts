import { beforeEach, describe, expect, it, vi } from "vitest";

const { unsubscribeMock, eqMock, fromMock } = vi.hoisted(() => {
  const eqMock = vi.fn();
  const deleteMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ delete: deleteMock }));
  return { unsubscribeMock: vi.fn(), eqMock, fromMock };
});

vi.mock("@/lib/push", () => ({ unsubscribeCurrentDevice: unsubscribeMock }));
vi.mock("@note/core/supabase/client", () => ({ getSupabaseClient: () => ({ from: fromMock }) }));

import { removeThisDevicePushSubscription } from "./notificationSettings";

beforeEach(() => {
  vi.clearAllMocks();
  eqMock.mockResolvedValue({ error: null });
});

describe("removeThisDevicePushSubscription(#131)", () => {
  it("ブラウザの購読を解除し、同じ endpoint のサーバーの行を消す", async () => {
    unsubscribeMock.mockResolvedValue("https://push.example/abc");

    await removeThisDevicePushSubscription();

    expect(fromMock).toHaveBeenCalledWith("evening_push_subscriptions");
    expect(eqMock).toHaveBeenCalledWith("endpoint", "https://push.example/abc");
  });

  it("この端末に購読が無ければ、サーバーには何もしない", async () => {
    unsubscribeMock.mockResolvedValue(null);

    await removeThisDevicePushSubscription();

    expect(fromMock).not.toHaveBeenCalled();
  });

  it("サーバーの行を消せなかったら例外にする(ブラウザ側は解除済み)", async () => {
    unsubscribeMock.mockResolvedValue("https://push.example/abc");
    eqMock.mockResolvedValue({ error: new Error("rls") });

    await expect(removeThisDevicePushSubscription()).rejects.toThrow("rls");
    expect(unsubscribeMock).toHaveBeenCalled();
  });
});
