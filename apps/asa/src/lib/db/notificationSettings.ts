"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { PushSubscriptionKeys } from "@/lib/push";

export interface NotificationSettings {
  reminderTime: string; // "HH:MM"
  enabled: boolean;
  // パートナーがきろくを新規に記入したときにPush通知を受け取るか。
  notifyPartnerRecord: boolean;
}

// 未入力日のリマインド通知(#3-2)の既定時刻。仕様どおり21:00。
export const DEFAULT_REMINDER_TIME = "21:00";

// DBのtime列は"HH:MM:SS"で返るため、アプリ内表現の"HH:MM"に揃える(#61と同じ考え方)。
function normalizeReminderTime(value: string): string {
  return value.slice(0, 5);
}

export async function fetchNotificationSettings(userId: string): Promise<NotificationSettings> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("notification_settings")
    .select("reminder_time, enabled, notify_partner_record")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { reminderTime: DEFAULT_REMINDER_TIME, enabled: false, notifyPartnerRecord: false };
  return {
    reminderTime: normalizeReminderTime(data.reminder_time),
    enabled: data.enabled,
    notifyPartnerRecord: data.notify_partner_record,
  };
}

export async function saveNotificationSettings(userId: string, settings: NotificationSettings): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("notification_settings").upsert({
    user_id: userId,
    reminder_time: settings.reminderTime,
    enabled: settings.enabled,
    notify_partner_record: settings.notifyPartnerRecord,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// この端末のPush購読をサーバーへ登録する(endpointが同じなら上書き)。
export async function savePushSubscription(userId: string, keys: PushSubscriptionKeys): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      { user_id: userId, endpoint: keys.endpoint, p256dh: keys.p256dh, auth_key: keys.auth },
      { onConflict: "endpoint" }
    );
  if (error) throw error;
}
