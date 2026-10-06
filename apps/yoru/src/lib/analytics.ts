import { getSupabaseClient } from "@note/core/supabase/client";

// 記録フローの計測イベント。あさノートと同じ analytics_events 表(共通表。定義の正はあさノート側の
// supabase/schema.sql)へ書く。同じ表に同居するので、event_name は必ず `evening_` で始め、
// あさノートの集計ビュー(record_flow_started 等を前提にしている)へ混ざらないようにする。
// 書き込み専用(insert のみ許可)で、本文・メモなどの記録内容は送らない。
export type AnalyticsEventName =
  | "evening_record_flow_started"
  | "evening_record_flow_resumed"
  | "evening_record_saved"
  | "evening_record_flow_paused";

interface TrackTarget {
  // 未ログイン(オフライン専用利用)は同期先が無いため計測しない。
  userId: string | null | undefined;
  recordId: string;
}

// 記録データ本体と違ってオフラインキュー(Dexie)は持たせず、送信に失敗しても記録の保存自体には
// 影響させない(呼び出し元は await しなくてよい)。
export function track(event: AnalyticsEventName, properties: Record<string, unknown>, target: TrackTarget): void {
  if (!target.userId) return;

  // 呼び出し元の処理を絶対に止めないよう、クライアント取得から送信まで全体を1つの try/catch で囲む。
  try {
    void getSupabaseClient()
      .from("analytics_events")
      .insert({
        user_id: target.userId,
        record_id: target.recordId,
        event_name: event,
        properties,
        client_ts: new Date().toISOString(),
      })
      .then(
        ({ error }) => {
          if (error) console.error("analytics track failed", event, error);
        },
        (error: unknown) => {
          console.error("analytics track failed", event, error);
        }
      );
  } catch (error) {
    console.error("analytics track failed", event, error);
  }
}
