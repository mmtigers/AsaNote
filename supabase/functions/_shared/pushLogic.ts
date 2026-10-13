// send-reminders / notify-partner が使う純粋ロジックのうち、あさノート固有のもの(追いつき窓・印の解除・通知の文言)。
// 日時・合言葉・購読への送信・リマインド対象の選択などの共通部分は pushCommon.ts(よるノートと共有。正はこちら。
// よるノート側は scripts/sync-push-common.mjs の複製)。呼び出し側は、これまでどおり "./pushLogic.ts" から取り込める。
// Deno・Supabase・web-push に依存しないよう切り出してあり、Vitestでテストできる(pushLogic.test.ts)。
// `supabase functions deploy` は相対importの_shared配下も同梱する。
import { jstTimeNow } from "./pushCommon.ts";

export * from "./pushCommon.ts";

// 設定時刻を過ぎてから、この分数より前までなら「遅れて届ける」対象にする(#130)。
// cron/Edge Functionが1分欠けても、次の分以降の実行で取り戻せる。経過が0〜(N-1)分の間が対象。
export const REMINDER_CATCHUP_WINDOW_MINUTES = 15;

// "HH:MM" または Postgres time の "HH:MM:SS" を、その日の0時からの分数にする。不正な値は null。
export function minutesOfDay(time: string): number | null {
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export interface ReminderSetting {
  user_id: string;
  reminder_time: string;
}

// 今(JST)リマインドを送る時間帯に入っていて、今日まだ送っていないユーザーを返す。
// 「設定時刻ちょうど」から「設定時刻 + (windowMinutes - 1)分」までが対象。
// 日付をまたぐ取り戻しはしない: 23:55設定で翌0:03に実行されても、同じJST日の中での経過ではないので
// 対象外(経過を「同じ日の中」だけで数えるため。翌日の0時台に昨日のリマインドが届くのを避ける)。
export function selectDueReminderUserIds(
  settings: ReminderSetting[],
  now: Date,
  alreadySentUserIds: Iterable<string>,
  windowMinutes: number = REMINDER_CATCHUP_WINDOW_MINUTES
): string[] {
  const nowMinutes = minutesOfDay(jstTimeNow(now));
  if (nowMinutes === null) return [];
  const sent = new Set(alreadySentUserIds);
  return settings
    .filter((s) => {
      if (sent.has(s.user_id)) return false;
      const at = minutesOfDay(s.reminder_time);
      if (at === null) return false;
      const elapsed = nowMinutes - at;
      return elapsed >= 0 && elapsed < windowMinutes;
    })
    .map((s) => s.user_id);
}

// 送信済みの印を付けたのに、そのユーザーの購読への送信が1件も成功しなかった場合、印を外して次の分に再試行させる。
// 購読が1件も無いユーザーは(送る先が無いので)印を残す。
export function selectUsersToRelease(
  subscriptions: { id: string; user_id: string }[],
  sentSubscriptionIds: Iterable<string>
): string[] {
  const sent = new Set(sentSubscriptionIds);
  const hasSubscription = new Set<string>();
  const hasSuccess = new Set<string>();
  for (const sub of subscriptions) {
    hasSubscription.add(sub.user_id);
    if (sent.has(sub.id)) hasSuccess.add(sub.user_id);
  }
  return [...hasSubscription].filter((id) => !hasSuccess.has(id));
}

export function reminderPayload(): string {
  return JSON.stringify({ title: "あさノート", body: "今日の記録がまだのようです", url: "/" });
}

export function partnerRecordPayload(name: string | null): string {
  return JSON.stringify({
    title: "あさノート",
    body: name ? `${name}さんがきろくを追加しました` : "パートナーがきろくを追加しました",
    url: "/timeline",
  });
}
