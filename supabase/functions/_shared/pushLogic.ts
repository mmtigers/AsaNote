// send-reminders / notify-partner が共有する純粋ロジック。
// Deno・Supabase・web-push に依存しないよう切り出してあり、Vitestでテストできる
// (pushLogic.test.ts)。`supabase functions deploy` は相対importの_shared配下も同梱する。

const JST_TIME_FORMAT = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const JST_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// "21:00"のような"HH:MM"形式。Intlのフォーマット結果("21:00")をそのまま使う。
export function jstTimeNow(now: Date): string {
  return JST_TIME_FORMAT.format(now);
}

// en-CAロケールは"YYYY-MM-DD"を返す(DBのrecord_dateと同じ形式)。
export function jstDateNow(now: Date): string {
  return JST_DATE_FORMAT.format(now);
}

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

export interface GroupMembership {
  user_id: string;
  group_id: string;
}

// リマインド対象を返す。今日(JST)、結果まで入った記録が**本人または同じグループの誰か**に
// 既にあれば対象から除く(夫婦のどちらかが記録済みなら、もう一方に催促しない)。
export function selectReminderTargets(
  dueUserIds: string[],
  recordedUserIds: Iterable<string>,
  memberships: GroupMembership[]
): string[] {
  const recorded = new Set(recordedUserIds);
  const groupOf = new Map(memberships.map((m) => [m.user_id, m.group_id]));
  const recordedGroups = new Set<string>();
  for (const userId of recorded) {
    const groupId = groupOf.get(userId);
    if (groupId) recordedGroups.add(groupId);
  }
  return dueUserIds.filter((id) => {
    if (recorded.has(id)) return false;
    const groupId = groupOf.get(id);
    return !(groupId && recordedGroups.has(groupId));
  });
}

// 410 Gone / 404 Not Found はブラウザ側で購読が失効したことを示す。
// それ以外(一時的な通信エラー等)は次回の実行に任せ、購読は残す。
export function isStaleSubscriptionError(error: unknown): boolean {
  const statusCode = (error as { statusCode?: number } | null | undefined)?.statusCode;
  return statusCode === 404 || statusCode === 410;
}

export function displayNameFromEmail(email: string | undefined | null): string | null {
  const name = email?.split("@")[0]?.trim();
  return name ? name : null;
}

// 呼び出し元を、専用の合言葉で確かめる(send-reminders は `CRON_SECRET`、notify-partner は `PARTNER_NOTIFY_SECRET`)。
// 以前は service role key との一致で確かめていたが、`SUPABASE_SERVICE_ROLE_KEY` は非推奨になり(JWT Signing
// Keys への移行後)、関数の中の値が、ダッシュボードの鍵と同じとは限らず、正しい鍵でも弾いてしまった。
// 専用の合言葉なら、Supabase の鍵の仕組みに左右されない。Supabase の JWT 検証(既定で有効)は、公開の anon
// キーでも通すため、これで「cron だけが呼べる」ようにしている。
// 短すぎる合言葉は、推測されやすいので、設定ミスとして通さない。
export const MIN_SECRET_LENGTH = 16;

export function isAuthorizedSecret(givenSecret: string | null, secret: string | undefined): boolean {
  if (!givenSecret || !secret || secret.length < MIN_SECRET_LENGTH) return false;
  // 長さが違うときも含め、比較時間が一致位置に左右されないようにする。
  let diff = givenSecret.length ^ secret.length;
  for (let i = 0; i < secret.length; i++) {
    diff |= (givenSecret.charCodeAt(i) || 0) ^ secret.charCodeAt(i);
  }
  return diff === 0;
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

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

export type SendNotification = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string
) => Promise<unknown>;

// 全購読へ送り、送信成功数と失効した購読のidを返す。失効以外の失敗は警告ログのみ。
export async function sendToSubscriptions(
  send: SendNotification,
  subscriptions: PushSubscriptionRow[],
  payload: string
): Promise<{ sent: number; staleSubscriptionIds: string[] }> {
  let sent = 0;
  const staleSubscriptionIds: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await send({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload);
        sent += 1;
      } catch (error) {
        if (isStaleSubscriptionError(error)) {
          staleSubscriptionIds.push(sub.id);
        } else {
          console.warn(`push送信に失敗しました(subscription=${sub.id}):`, error);
        }
      }
    })
  );

  return { sent, staleSubscriptionIds };
}
