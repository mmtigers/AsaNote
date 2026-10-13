"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_REMINDER_TIME,
  fetchNotificationSettings,
  savePushSubscription,
  saveNotificationSettings,
} from "@/lib/db/notificationSettings";
import { isPushSupported, requestPushSubscription, restorePushSubscription } from "@/lib/push";
import { runAction, runSilently } from "@note/core/group/runAction";

// 共有設定画面の「通知」まわりの状態と操作(#3-2)。use*Adminフック群と同じ形に揃え、
// 画面(page.tsx)は表示の組み立てだけを持つ。
export interface NotificationSettingsAdmin {
  supported: boolean;
  loading: boolean;
  saving: boolean;
  reminderTime: string;
  enabled: boolean;
  notifyPartnerRecord: boolean;
  setReminderTime: (value: string) => void;
  setEnabled: (value: boolean) => Promise<void>;
  setNotifyPartnerRecord: (value: boolean) => Promise<void>;
  reload: () => Promise<void>;
}

// ログアウトで解除された購読を、この端末へ戻す(#174)。許可の確認は出さず、ブラウザの許可が
// すでにgrantedで、この端末に購読が無いときだけ作り直してサーバーへ登録する
// (判定はrestorePushSubscription。すでに購読があれば何もしないので、購読は増えない)。
// ユーザーの操作ではないので、失敗してもエラーは出さずログに残すのみ。
async function restorePushIfNeeded(userId: string) {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) return;
  await runSilently(async () => {
    const keys = await restorePushSubscription(vapidPublicKey);
    if (keys) await savePushSubscription(userId, keys);
  });
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
  const [notifyPartnerRecord, setNotifyPartnerRecordState] = useState(false);

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
      setNotifyPartnerRecordState(result.value.notifyPartnerRecord);
      // ログアウトで解除された購読を、ログインした本人の設定がONなら戻す(#174)。
      // 画面の表示は待たせない。
      if (result.value.enabled || result.value.notifyPartnerRecord) {
        void restorePushIfNeeded(userId);
      }
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
      () => saveNotificationSettings(userId, { reminderTime: value, enabled, notifyPartnerRecord }),
      "通知時刻の保存に失敗しました",
      onError
    );
    setSaving(false);
  }

  // この端末のPush購読を(無ければブラウザの許可を求めて)作成し、サーバーへ登録する。
  // リマインドとパートナー通知のどちらをONにする場合も共通。失敗時はエラーを出してfalseを返す。
  async function ensurePushSubscription(): Promise<boolean> {
    if (!userId) return false;
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      onError("通知機能が未設定です(NEXT_PUBLIC_VAPID_PUBLIC_KEY)。管理者にお問い合わせください。");
      return false;
    }
    const subscribeResult = await runAction(
      () => requestPushSubscription(vapidPublicKey),
      "通知の許可を取得できませんでした",
      onError,
      "push/subscribe"
    );
    if (!subscribeResult.ok) return false;
    const subscriptionKeys = subscribeResult.value;
    if (!subscriptionKeys) {
      onError("通知が許可されませんでした。ブラウザの通知設定をご確認ください。");
      return false;
    }
    const saveSubResult = await runAction(
      () => savePushSubscription(userId, subscriptionKeys),
      "通知購読の保存に失敗しました",
      onError,
      "push/save-subscription"
    );
    return saveSubResult.ok;
  }

  // ONにする際は、まだこの端末でPush購読が無ければブラウザの許可を求めて購読する。
  // OFFにする際は購読はそのまま残し、enabledフラグだけ倒す(送信側がこのフラグを見て
  // スキップするため、端末側の購読解除までは不要)。
  async function setEnabled(value: boolean) {
    if (!userId) return;
    onError(null);
    setSaving(true);

    if (value && !(await ensurePushSubscription())) {
      setSaving(false);
      return;
    }

    const saved = await runAction(
      () => saveNotificationSettings(userId, { reminderTime, enabled: value, notifyPartnerRecord }),
      "通知設定の保存に失敗しました",
      onError
    );
    if (saved.ok) setEnabledState(value);
    setSaving(false);
  }

  // パートナーがきろくを新規に記入したときの通知のON/OFF。ONにする際の購読作成は
  // リマインドと同じ(ensurePushSubscription)。OFFでも購読は残す(送信側がフラグを見る)。
  async function setNotifyPartnerRecord(value: boolean) {
    if (!userId) return;
    onError(null);
    setSaving(true);

    if (value && !(await ensurePushSubscription())) {
      setSaving(false);
      return;
    }

    const saved = await runAction(
      () => saveNotificationSettings(userId, { reminderTime, enabled, notifyPartnerRecord: value }),
      "通知設定の保存に失敗しました",
      onError
    );
    if (saved.ok) setNotifyPartnerRecordState(value);
    setSaving(false);
  }

  return {
    supported,
    loading,
    saving,
    reminderTime,
    enabled,
    notifyPartnerRecord,
    setReminderTime,
    setEnabled,
    setNotifyPartnerRecord,
    reload,
  };
}
