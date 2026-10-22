// send-evening-reminders / notify-evening-partner が使う純粋ロジックのうち、よるノート固有のもの(通知の文言)。
// 日時・合言葉・購読への送信・リマインド対象の選択などの共通部分は pushCommon.ts。**あさノート側
// (supabase/functions/_shared/pushCommon.ts)が正で、これは scripts/sync-push-common.mjs の複製なので、直接編集しない**。
// 呼び出し側は、これまでどおり "./pushLogic.ts" から取り込める。
// Deno・Supabase・web-push に依存しないよう切り出してあり、Vitestでテストできる(pushLogic.test.ts)。
// `supabase functions deploy` は相対importの_shared配下も同梱する。

export * from "./pushCommon.ts";

export function reminderPayload(): string {
  return JSON.stringify({ title: "よるノート", body: "今夜の記録がまだのようです", url: "/" });
}

export function partnerRecordPayload(name: string | null): string {
  return JSON.stringify({
    title: "よるノート",
    body: name ? `${name}さんが今夜の記録を追加しました` : "パートナーが今夜の記録を追加しました",
    url: "/timeline",
  });
}

export function partnerCommentPayload(name: string | null): string {
  return JSON.stringify({
    title: "よるノート",
    body: name ? `${name}さんがコメントしました` : "パートナーがコメントしました",
    url: "/timeline",
  });
}
