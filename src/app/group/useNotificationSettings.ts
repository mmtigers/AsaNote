"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_REMINDER_TIME,
  fetchNotificationSettings,
  savePushSubscription,
  saveNotificationSettings,
} from "@/lib/db/notificationSettings";
import { isPushSupported, requestPushSubscription } from "@/lib/push";
import { runAction } from "./runAction";

// 共有設定画面の「通知」まわりの状態と操作。use*Adminフック群と同じ形に揃え、
// 画面(page.tsx)は表示の組み立てだけを持つ。
export interface NotificationSettingsAdmin {
  supported: boolean;
  loading: boolean;
  saving: boolean;
  reminderTime: string;
  enabled: boolean;
  setReminderTime: (value: string) => Promise<void>;
  setEnabled: (value: boolean) => Promise<void>;
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

  useEffect(() => {
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 未ログインならロード表示を止めるだけで、フェッチは発生しない
      setLoading(false);
      return;
    }
    let active = true;
    runAction(() => fetchNotificationSettings(userId), "通知設定の取得に失敗しました", (m) => onError(m))
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setReminderTimeState(result.value.reminderTime);
          setEnabledState(result.value.enabled);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, onError]);

  // 時刻の変更は即保存する。個人設定1行のupsertなので、連続変更で呼び出しが増えても許容する。
  // 未入力(クリア)は無効な値なので保存しない。
  async function setReminderTime(value: string) {
    setReminderTimeState(value);
    if (!userId || !value) return;
    onError(null);
    setSaving(true);
    await runAction(
      () => saveNotificationSettings(userId, { reminderTime: value, enabled }),
      "通知時刻の保存に失敗しました",
      onError
    );
    setSaving(false);
  }

  // この端末のPush購読を(無ければブラウザの許可を求めて)作成し、サーバーへ登録する。
  async function ensurePushSubscription(): Promise<boolean> {
    if (!userId) return false;
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      onError("通知機能が未設定です(NEXT_PUBLIC_VAPID_PUBLIC_KEY)。");
      return false;
    }
    const subscribeResult = await runAction(
      () => requestPushSubscription(vapidPublicKey),
      "通知の許可を取得できませんでした",
      onError
    );
    if (!subscribeResult.ok) return false;
    if (!subscribeResult.value) {
      onError("通知が許可されませんでした。ブラウザの通知設定をご確認ください。");
      return false;
    }
    const keys = subscribeResult.value;
    const saved = await runAction(() => savePushSubscription(userId, keys), "通知購読の保存に失敗しました", onError);
    return saved.ok;
  }

  // ONにする際は、この端末でPush購読が無ければ許可を求めて購読する。
  // OFFにする際は購読は残し、enabledフラグだけ倒す(送信側がこのフラグを見る)。
  async function setEnabled(value: boolean) {
    if (!userId) return;
    onError(null);
    setSaving(true);
    if (value && !(await ensurePushSubscription())) {
      setSaving(false);
      return;
    }
    const saved = await runAction(
      () => saveNotificationSettings(userId, { reminderTime, enabled: value }),
      "通知設定の保存に失敗しました",
      onError
    );
    if (saved.ok) setEnabledState(value);
    setSaving(false);
  }

  return { supported, loading, saving, reminderTime, enabled, setReminderTime, setEnabled };
}
