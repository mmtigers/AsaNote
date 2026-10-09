// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchNotificationSettings: vi.fn(),
  saveNotificationSettings: vi.fn(),
  savePushSubscription: vi.fn(),
  isPushSupported: vi.fn(),
  requestPushSubscription: vi.fn(),
  restorePushSubscription: vi.fn(),
}));

vi.mock("@/lib/db/notificationSettings", () => ({
  DEFAULT_REMINDER_TIME: "21:00",
  fetchNotificationSettings: mocks.fetchNotificationSettings,
  saveNotificationSettings: mocks.saveNotificationSettings,
  savePushSubscription: mocks.savePushSubscription,
}));
vi.mock("@/lib/push", () => ({
  isPushSupported: mocks.isPushSupported,
  requestPushSubscription: mocks.requestPushSubscription,
  restorePushSubscription: mocks.restorePushSubscription,
}));

import { useNotificationSettings } from "./useNotificationSettings";

const KEYS = { endpoint: "https://push/1", p256dh: "k", auth: "a" };

async function setup(userId: string | null = "u1") {
  const onError = vi.fn();
  const hook = renderHook(() => useNotificationSettings(userId, onError));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return { ...hook, onError };
}

describe("useNotificationSettings", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.isPushSupported.mockReturnValue(true);
    mocks.fetchNotificationSettings.mockResolvedValue({
      reminderTime: "20:30",
      enabled: false,
      notifyPartnerRecord: false,
    });
    mocks.saveNotificationSettings.mockResolvedValue(undefined);
    mocks.savePushSubscription.mockResolvedValue(undefined);
    mocks.requestPushSubscription.mockResolvedValue(KEYS);
    mocks.restorePushSubscription.mockResolvedValue(null);
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "vapid-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("マウント時に保存済みの設定を読み込む", async () => {
    const { result } = await setup();
    expect(mocks.fetchNotificationSettings).toHaveBeenCalledWith("u1");
    expect(result.current.reminderTime).toBe("20:30");
    expect(result.current.enabled).toBe(false);
    expect(result.current.supported).toBe(true);
  });

  it("userIdが無ければ取得せず読み込み完了にする", async () => {
    const { result } = await setup(null);
    expect(mocks.fetchNotificationSettings).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  it("取得に失敗したらエラーを通知し、既定値のままにする", async () => {
    mocks.fetchNotificationSettings.mockRejectedValue(new Error("boom"));
    const { result, onError } = await setup();
    expect(onError).toHaveBeenCalledWith(expect.any(String));
    expect(result.current.reminderTime).toBe("21:00");
  });

  it("非対応ブラウザではsupported=false", async () => {
    mocks.isPushSupported.mockReturnValue(false);
    const { result } = await setup();
    expect(result.current.supported).toBe(false);
  });

  describe("setEnabled(true)", () => {
    it("購読を作成・保存したうえで設定を保存し、状態をONにする", async () => {
      const { result } = await setup();
      await act(() => result.current.setEnabled(true));
      expect(mocks.requestPushSubscription).toHaveBeenCalledWith("vapid-key");
      expect(mocks.savePushSubscription).toHaveBeenCalledWith("u1", KEYS);
      expect(mocks.saveNotificationSettings).toHaveBeenCalledWith("u1", {
        reminderTime: "20:30",
        enabled: true,
        notifyPartnerRecord: false,
      });
      expect(result.current.enabled).toBe(true);
      expect(result.current.saving).toBe(false);
    });

    it("VAPID公開鍵が未設定ならエラーを出し、何も保存しない", async () => {
      vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
      const { result, onError } = await setup();
      await act(() => result.current.setEnabled(true));
      expect(onError).toHaveBeenLastCalledWith(expect.stringContaining("NEXT_PUBLIC_VAPID_PUBLIC_KEY"));
      expect(mocks.requestPushSubscription).not.toHaveBeenCalled();
      expect(mocks.saveNotificationSettings).not.toHaveBeenCalled();
      expect(result.current.enabled).toBe(false);
      expect(result.current.saving).toBe(false);
    });

    it("ブラウザの許可が拒否されたらエラーを出し、ONにしない", async () => {
      mocks.requestPushSubscription.mockResolvedValue(null);
      const { result, onError } = await setup();
      await act(() => result.current.setEnabled(true));
      expect(onError).toHaveBeenLastCalledWith(expect.stringContaining("通知が許可されませんでした"));
      expect(mocks.savePushSubscription).not.toHaveBeenCalled();
      expect(mocks.saveNotificationSettings).not.toHaveBeenCalled();
      expect(result.current.enabled).toBe(false);
    });

    it("購読の取得で例外が出たらエラーを出し、ONにしない", async () => {
      mocks.requestPushSubscription.mockRejectedValue(new Error("denied"));
      const { result, onError } = await setup();
      await act(() => result.current.setEnabled(true));
      expect(onError).toHaveBeenLastCalledWith(expect.any(String));
      expect(mocks.saveNotificationSettings).not.toHaveBeenCalled();
      expect(result.current.enabled).toBe(false);
    });

    it("購読の保存に失敗したら設定を保存しない", async () => {
      mocks.savePushSubscription.mockRejectedValue(new Error("db"));
      const { result } = await setup();
      await act(() => result.current.setEnabled(true));
      expect(mocks.saveNotificationSettings).not.toHaveBeenCalled();
      expect(result.current.enabled).toBe(false);
    });

    it("設定の保存に失敗したら状態をONにしない", async () => {
      mocks.saveNotificationSettings.mockRejectedValue(new Error("db"));
      const { result, onError } = await setup();
      await act(() => result.current.setEnabled(true));
      expect(onError).toHaveBeenLastCalledWith(expect.any(String));
      expect(result.current.enabled).toBe(false);
      expect(result.current.saving).toBe(false);
    });
  });

  it("setEnabled(false)は購読を作らず、フラグだけ保存する", async () => {
    mocks.fetchNotificationSettings.mockResolvedValue({
      reminderTime: "20:30",
      enabled: true,
      notifyPartnerRecord: false,
    });
    const { result } = await setup();
    await act(() => result.current.setEnabled(false));
    expect(mocks.requestPushSubscription).not.toHaveBeenCalled();
    expect(mocks.saveNotificationSettings).toHaveBeenCalledWith("u1", {
      reminderTime: "20:30",
      enabled: false,
      notifyPartnerRecord: false,
    });
    expect(result.current.enabled).toBe(false);
  });

  it("userIdが無ければsetEnabled/setNotifyPartnerRecord/setReminderTimeは保存しない", async () => {
    const { result } = await setup(null);
    await act(async () => {
      await result.current.setEnabled(true);
      await result.current.setNotifyPartnerRecord(true);
      await result.current.setReminderTime("07:00");
    });
    expect(mocks.saveNotificationSettings).not.toHaveBeenCalled();
    expect(mocks.requestPushSubscription).not.toHaveBeenCalled();
  });

  describe("setNotifyPartnerRecord", () => {
    it("ONにする際は購読を作成し、パートナー通知フラグを保存する", async () => {
      const { result } = await setup();
      await act(() => result.current.setNotifyPartnerRecord(true));
      expect(mocks.savePushSubscription).toHaveBeenCalledWith("u1", KEYS);
      expect(mocks.saveNotificationSettings).toHaveBeenCalledWith("u1", {
        reminderTime: "20:30",
        enabled: false,
        notifyPartnerRecord: true,
      });
      expect(result.current.notifyPartnerRecord).toBe(true);
    });

    it("許可が拒否されたらONにしない", async () => {
      mocks.requestPushSubscription.mockResolvedValue(null);
      const { result, onError } = await setup();
      await act(() => result.current.setNotifyPartnerRecord(true));
      expect(onError).toHaveBeenLastCalledWith(expect.stringContaining("通知が許可されませんでした"));
      expect(mocks.saveNotificationSettings).not.toHaveBeenCalled();
      expect(result.current.notifyPartnerRecord).toBe(false);
    });

    it("OFFにする際は購読を作らない", async () => {
      mocks.fetchNotificationSettings.mockResolvedValue({
        reminderTime: "20:30",
        enabled: false,
        notifyPartnerRecord: true,
      });
      const { result } = await setup();
      await act(() => result.current.setNotifyPartnerRecord(false));
      expect(mocks.requestPushSubscription).not.toHaveBeenCalled();
      expect(result.current.notifyPartnerRecord).toBe(false);
    });

    it("設定の保存に失敗したら状態を変えない", async () => {
      mocks.saveNotificationSettings.mockRejectedValue(new Error("db"));
      const { result } = await setup();
      await act(() => result.current.setNotifyPartnerRecord(true));
      expect(result.current.notifyPartnerRecord).toBe(false);
    });
  });

  describe("setReminderTime", () => {
    it("画面の値を即時更新し、他の設定を保ったまま保存する", async () => {
      const { result } = await setup();
      await act(() => result.current.setReminderTime("07:15"));
      expect(result.current.reminderTime).toBe("07:15");
      expect(mocks.saveNotificationSettings).toHaveBeenCalledWith("u1", {
        reminderTime: "07:15",
        enabled: false,
        notifyPartnerRecord: false,
      });
      expect(result.current.saving).toBe(false);
    });

    it("保存に失敗したらエラーを通知する", async () => {
      mocks.saveNotificationSettings.mockRejectedValue(new Error("db"));
      const { result, onError } = await setup();
      await act(() => result.current.setReminderTime("07:15"));
      expect(onError).toHaveBeenLastCalledWith(expect.any(String));
      expect(result.current.saving).toBe(false);
    });
  });

  describe("購読の復元(#174)", () => {
    const ON = { reminderTime: "20:30", enabled: true, notifyPartnerRecord: false };

    it("設定がONで、復元すべき購読が返れば、許可を求めずにサーバーへ登録する", async () => {
      mocks.fetchNotificationSettings.mockResolvedValue(ON);
      mocks.restorePushSubscription.mockResolvedValue(KEYS);
      await setup();
      await waitFor(() => expect(mocks.savePushSubscription).toHaveBeenCalledWith("u1", KEYS));
      expect(mocks.restorePushSubscription).toHaveBeenCalledWith("vapid-key");
      expect(mocks.requestPushSubscription).not.toHaveBeenCalled();
    });

    it("パートナー通知だけがONでも復元する", async () => {
      mocks.fetchNotificationSettings.mockResolvedValue({ ...ON, enabled: false, notifyPartnerRecord: true });
      mocks.restorePushSubscription.mockResolvedValue(KEYS);
      await setup();
      await waitFor(() => expect(mocks.savePushSubscription).toHaveBeenCalledWith("u1", KEYS));
    });

    it("復元すべき購読が無ければ(許可なし・すでに購読あり)、何も登録しない", async () => {
      mocks.fetchNotificationSettings.mockResolvedValue(ON);
      mocks.restorePushSubscription.mockResolvedValue(null);
      await setup();
      await waitFor(() => expect(mocks.restorePushSubscription).toHaveBeenCalled());
      expect(mocks.savePushSubscription).not.toHaveBeenCalled();
    });

    it("設定が両方OFFなら、復元を試みない", async () => {
      await setup();
      expect(mocks.restorePushSubscription).not.toHaveBeenCalled();
      expect(mocks.savePushSubscription).not.toHaveBeenCalled();
    });

    it("ユーザーが無ければ、復元を試みない", async () => {
      await setup(null);
      expect(mocks.restorePushSubscription).not.toHaveBeenCalled();
    });

    it("VAPID公開鍵が未設定なら、復元を試みない", async () => {
      vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
      mocks.fetchNotificationSettings.mockResolvedValue(ON);
      await setup();
      expect(mocks.restorePushSubscription).not.toHaveBeenCalled();
    });

    it("復元に失敗してもエラーは出さない(ユーザー操作ではないため)", async () => {
      mocks.fetchNotificationSettings.mockResolvedValue(ON);
      mocks.restorePushSubscription.mockRejectedValue(new Error("push down"));
      const { onError, result } = await setup();
      await waitFor(() => expect(mocks.restorePushSubscription).toHaveBeenCalled());
      expect(onError).not.toHaveBeenCalledWith(expect.any(String));
      expect(result.current.enabled).toBe(true);
    });
  });
});
