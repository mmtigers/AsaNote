// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchNotificationSettings: vi.fn(),
  saveNotificationSettings: vi.fn(),
  savePushSubscription: vi.fn(),
  requestPushSubscription: vi.fn(),
}));

vi.mock("@/lib/db/notificationSettings", () => ({
  DEFAULT_REMINDER_TIME: "21:00",
  fetchNotificationSettings: mocks.fetchNotificationSettings,
  saveNotificationSettings: mocks.saveNotificationSettings,
  savePushSubscription: mocks.savePushSubscription,
}));
vi.mock("@/lib/push", () => ({
  isPushSupported: () => true,
  requestPushSubscription: mocks.requestPushSubscription,
}));

import { useNotificationSettings } from "./useNotificationSettings";

const KEYS = { endpoint: "https://push.example/1", p256dh: "p", auth: "a" };

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "vapid-key");
  mocks.fetchNotificationSettings.mockResolvedValue({ reminderTime: "21:00", enabled: false, notifyPartnerRecord: false });
  mocks.saveNotificationSettings.mockResolvedValue(undefined);
  mocks.savePushSubscription.mockResolvedValue(undefined);
  mocks.requestPushSubscription.mockResolvedValue(KEYS);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

async function setup() {
  const onError = vi.fn();
  const hook = renderHook(() => useNotificationSettings("u1", onError));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return { hook, onError };
}

describe("useNotificationSettings", () => {
  it("保存済みの設定を読み込む", async () => {
    mocks.fetchNotificationSettings.mockResolvedValue({ reminderTime: "20:30", enabled: true, notifyPartnerRecord: true });
    const { hook } = await setup();
    expect(hook.result.current.reminderTime).toBe("20:30");
    expect(hook.result.current.enabled).toBe(true);
    expect(hook.result.current.notifyPartnerRecord).toBe(true);
  });

  it("ONにすると購読を作って保存し、設定を保存する", async () => {
    const { hook } = await setup();
    await act(() => hook.result.current.setEnabled(true));
    expect(mocks.savePushSubscription).toHaveBeenCalledWith("u1", KEYS);
    expect(mocks.saveNotificationSettings).toHaveBeenCalledWith("u1", { reminderTime: "21:00", enabled: true, notifyPartnerRecord: false });
    expect(hook.result.current.enabled).toBe(true);
  });

  it("通知が許可されなければONにせず、何も保存しない", async () => {
    mocks.requestPushSubscription.mockResolvedValue(null);
    const { hook, onError } = await setup();
    await act(() => hook.result.current.setEnabled(true));
    expect(onError).toHaveBeenLastCalledWith(expect.stringContaining("許可"));
    expect(mocks.saveNotificationSettings).not.toHaveBeenCalled();
    expect(hook.result.current.enabled).toBe(false);
  });

  it("VAPID公開鍵が未設定ならエラーを出し、何も保存しない", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    const { hook, onError } = await setup();
    await act(() => hook.result.current.setEnabled(true));
    expect(onError).toHaveBeenLastCalledWith(expect.stringContaining("NEXT_PUBLIC_VAPID_PUBLIC_KEY"));
    expect(mocks.requestPushSubscription).not.toHaveBeenCalled();
    expect(mocks.saveNotificationSettings).not.toHaveBeenCalled();
  });

  it("OFFにしても購読は触らず、フラグだけ保存する", async () => {
    mocks.fetchNotificationSettings.mockResolvedValue({ reminderTime: "21:00", enabled: true, notifyPartnerRecord: false });
    const { hook } = await setup();
    await act(() => hook.result.current.setEnabled(false));
    expect(mocks.requestPushSubscription).not.toHaveBeenCalled();
    expect(mocks.saveNotificationSettings).toHaveBeenCalledWith("u1", { reminderTime: "21:00", enabled: false, notifyPartnerRecord: false });
  });

  it("時刻を変えると即保存し、空にされたら保存しない", async () => {
    const { hook } = await setup();
    await act(() => hook.result.current.setReminderTime("20:45"));
    expect(mocks.saveNotificationSettings).toHaveBeenCalledWith("u1", {
      reminderTime: "20:45",
      enabled: false,
      notifyPartnerRecord: false,
    });
    mocks.saveNotificationSettings.mockClear();
    await act(() => hook.result.current.setReminderTime(""));
    expect(mocks.saveNotificationSettings).not.toHaveBeenCalled();
  });

  it("パートナーの記録通知をONにすると購読を用意し、リマインド側の設定を保ったまま保存する", async () => {
    mocks.fetchNotificationSettings.mockResolvedValue({ reminderTime: "20:30", enabled: true, notifyPartnerRecord: false });
    const { hook } = await setup();
    await act(() => hook.result.current.setNotifyPartnerRecord(true));
    expect(mocks.savePushSubscription).toHaveBeenCalledWith("u1", KEYS);
    expect(mocks.saveNotificationSettings).toHaveBeenCalledWith("u1", {
      reminderTime: "20:30",
      enabled: true,
      notifyPartnerRecord: true,
    });
    expect(hook.result.current.notifyPartnerRecord).toBe(true);
  });

  it("通知が許可されなければパートナーの記録通知はONにならない", async () => {
    mocks.requestPushSubscription.mockResolvedValue(null);
    const { hook } = await setup();
    await act(() => hook.result.current.setNotifyPartnerRecord(true));
    expect(mocks.saveNotificationSettings).not.toHaveBeenCalled();
    expect(hook.result.current.notifyPartnerRecord).toBe(false);
  });
});
