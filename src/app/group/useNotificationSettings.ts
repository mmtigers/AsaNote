"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_REMINDER_TIME,
  fetchNotificationSettings,
  savePushSubscription,
  saveNotificationSettings,
} from "@/lib/db/notificationSettings";
import { isPushSupported, requestPushSubscription } from "@/lib/push";
import { runAction } from "./runAction";

// 共有設定画面の「通知」まわりの状態と操作(#3-2)。use*Adminフック群と同じ形に揃え、
// 画面(page.tsx)は表示の組み立てだけを持つ。
export interface NotificationSettingsAdmin {
  supported: boolean;
  loading: boolean;
  saving: boolean;
  reminderTime: string;
  enabled: boolean;
  setReminderTime: (value: string) => void;
  setEnabled: (value: boolean) => Promise<void>;
  reload: () => Promise<void>;
}

export function useNotificationSettings(
  userId: string | null | undefined,
  onError: (message: string | null) => void
): NotificationSettingsAdmin {
  const supported = isPushSupported();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reminderTime, setReminderTimeState] = useState(DEFAULT_REMINDER_TIME);
  const [enabled, setEnabledState] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    onError(null);
    setLoading(true);
    const result = await runAction(
      () => fetchNotificationSettings(userId),
      "通知設定の取得に失敗しました",
      onError
    );
    if (result.ok) {
      setReminderTimeState(result.value.reminderTime);
      setEnabledState(result.value.enabled);
    }
    setLoading(false);
  }, [userId, onError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ログイン中ユーザーの通知設定をマウント時/ユーザー切替時に取得する、他のuse*Adminフックと同じ定型
    void reload();
  }, [reload]);

  // リマインド時刻の変更(即保存)。入力の度に叩くとtime inputの連続変更で
  // 呼び出しが増えるが、個人設定1行のupsertなので許容する。
  async function setReminderTime(value: string) {
    setReminderTimeState(value);
    if (!userId) return;
    onError(null);
    setSaving(true);
    await runAction(
      () => saveNotificationSettings(userId, { reminderTime: value, enabled }),
      "通知時刻の保存に失敗しました",
      onError
    );
    setSaving(false);
  }

  // ONにする際は、まだこの端末でPush購読が無ければブラウザの許可を求めて購読する。
  // OFFにする際は購読はそのまま残し、enabledフラグだけ倒す(送信側がこのフラグを見て
  // スキップするため、端末側の購読解除までは不要)。
  async function setEnabled(value: boolean) {
    if (!userId) return;
    onError(null);
    setSaving(true);

    if (value) {
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        onError("通知機能が未設定です(NEXT_PUBLIC_VAPID_PUBLIC_KEY)。管理者にお問い合わせください。");
        setSaving(false);
        return;
      }
      const subscribeResult = await runAction(
        () => requestPushSubscription(vapidPublicKey),
        "通知の許可を取得できませんでした",
        onError
      );
      if (!subscribeResult.ok) {
        setSaving(false);
        return;
      }
      const subscriptionKeys = subscribeResult.value;
      if (!subscriptionKeys) {
        onError("通知が許可されませんでした。ブラウザの通知設定をご確認ください。");
        setSaving(false);
        return;
      }
      const saveSubResult = await runAction(
        () => savePushSubscription(userId, subscriptionKeys),
        "通知購読の保存に失敗しました",
        onError
      );
      if (!saveSubResult.ok) {
        setSaving(false);
        return;
      }
    }

    const saved = await runAction(
      () => saveNotificationSettings(userId, { reminderTime, enabled: value }),
      "通知設定の保存に失敗しました",
      onError
    );
    if (saved.ok) setEnabledState(value);
    setSaving(false);
  }

  return { supported, loading, saving, reminderTime, enabled, setReminderTime, setEnabled, reload };
}
