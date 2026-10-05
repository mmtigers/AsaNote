"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { PushSubscriptionKeys } from "@/lib/push";

export interface NotificationSettings {
  reminderTime: string; // "HH:MM"
  enabled: boolean;
}

// 夜のリマインド通知の既定時刻(SPEC: 21:00)。
export const DEFAULT_REMINDER_TIME = "21:00";

// DBのtime列は"HH:MM:SS"で返るため、アプリ内表現の"HH:MM"に揃える。
function normalizeReminderTime(value: string): string {
  return value.slice(0, 5);
}

// 行が無ければ「未設定=OFF」。ONにする操作(通知の許可)をした人にだけ送るため。
export async function fetchNotificationSettings(userId: string): Promise<NotificationSettings> {
  const { data, error } = await getSupabaseClient()
    .from("evening_notification_settings")
    .select("reminder_time, enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { reminderTime: DEFAULT_REMINDER_TIME, enabled: false };
  return { reminderTime: normalizeReminderTime(data.reminder_time), enabled: data.enabled };
}

export async function saveNotificationSettings(userId: string, settings: NotificationSettings): Promise<void> {
  const { error } = await getSupabaseClient().from("evening_notification_settings").upsert({
    user_id: userId,
    reminder_time: settings.reminderTime,
    enabled: settings.enabled,
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
