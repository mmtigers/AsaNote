"use client";

import { getSupabaseClient } from "@note/core/supabase/client";
import { unsubscribeCurrentDevice, type PushSubscriptionKeys } from "@/lib/push";

export interface NotificationSettings {
  reminderTime: string; // "HH:MM"
  enabled: boolean;
  // パートナーが今夜の記録を追加したときのPush通知を受け取るか。
  notifyPartnerRecord: boolean;
  // パートナーが記録にコメントしたときのPush通知を受け取るか。
  notifyPartnerComment: boolean;
  // 連絡メモの下書きができたときのPush通知を受け取るか(docs/liaison-memo.md §3)。既定はON。
  notifyLiaisonMemo: boolean;
}

// 夜のリマインド通知の既定時刻(SPEC: 21:00)。
export const DEFAULT_REMINDER_TIME = "21:00";

// DBのtime列は"HH:MM:SS"で返るため、アプリ内表現の"HH:MM"に揃える。
function normalizeReminderTime(value: string): string {
  return value.slice(0, 5);
}

// 行が無ければ「未設定=OFF」。ONにする操作(通知の許可)をした人にだけ送るため。
// ただし連絡メモの通知だけは既定ON(行が無い人にも送る。送る先はこの端末の購読がある人だけ)。
export async function fetchNotificationSettings(userId: string): Promise<NotificationSettings> {
  const { data, error } = await getSupabaseClient()
    .from("evening_notification_settings")
    .select("reminder_time, enabled, notify_partner_record, notify_partner_comment, notify_liaison_memo")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    return {
      reminderTime: DEFAULT_REMINDER_TIME,
      enabled: false,
      notifyPartnerRecord: false,
      notifyPartnerComment: false,
      notifyLiaisonMemo: true,
    };
  }
  return {
    reminderTime: normalizeReminderTime(data.reminder_time),
    enabled: data.enabled,
    notifyPartnerRecord: data.notify_partner_record,
    notifyPartnerComment: data.notify_partner_comment,
    notifyLiaisonMemo: data.notify_liaison_memo,
  };
}

export async function saveNotificationSettings(userId: string, settings: NotificationSettings): Promise<void> {
  const { error } = await getSupabaseClient().from("evening_notification_settings").upsert({
    user_id: userId,
    reminder_time: settings.reminderTime,
    enabled: settings.enabled,
    notify_partner_record: settings.notifyPartnerRecord,
    notify_partner_comment: settings.notifyPartnerComment,
    notify_liaison_memo: settings.notifyLiaisonMemo,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// この端末のPush購読をサーバーへ登録する(endpointが同じなら上書き)。
export async function savePushSubscription(userId: string, keys: PushSubscriptionKeys): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("evening_push_subscriptions")
    .upsert(
      { user_id: userId, endpoint: keys.endpoint, p256dh: keys.p256dh, auth_key: keys.auth },
      { onConflict: "endpoint" }
    );
  if (error) throw error;
}

// ログアウト時に、この端末のPush購読を解除し、サーバーの行も消す(#131)。
// 共有端末で、前のユーザー宛の通知が次の人の端末に届き続けないようにするため。
// サーバーの行はRLS(本人のみ削除可)のため、サインアウトの**前**に呼ぶこと。
// 先にブラウザ側を解除する: サーバーの行を消せなかった(オフライン等)場合も、端末には
// 通知が届かなくなる。
export async function removeThisDevicePushSubscription(): Promise<void> {
  const endpoint = await unsubscribeCurrentDevice();
  if (!endpoint) return;
  const { error } = await getSupabaseClient().from("evening_push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw error;
}
