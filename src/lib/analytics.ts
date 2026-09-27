import { getSupabaseClient } from "@/lib/supabase/client";

export type AnalyticsEventName =
  | "record_flow_started"
  | "record_step_viewed"
  | "record_outcome_selected"
  | "record_saved"
  | "record_flow_paused"
  | "record_flow_resumed";

interface TrackTarget {
  // 未ログイン(オフライン専用利用)はSupabaseへの同期先が無いため計測しない。
  userId: string | null | undefined;
  recordId: string;
}

// 記録フローの計測イベントをanalytics_eventsへ書き込む(fire-and-forget)。
// 記録データ本体と違ってオフラインキュー(Dexie)は持たせず、送信に失敗しても
// 記録の保存自体には影響させない(呼び出し元はawaitしなくてよい)。
export function track(event: AnalyticsEventName, properties: Record<string, unknown>, target: TrackTarget): void {
  if (!target.userId) return;

  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch {
    return;
  }

  void supabase
    .from("analytics_events")
    .insert({
      user_id: target.userId,
      record_id: target.recordId,
      event_name: event,
      properties,
      client_ts: new Date().toISOString(),
    })
    .then(({ error }) => {
      if (error) console.error("analytics track failed", event, error);
    });
}
