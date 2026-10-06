// send-evening-reminders が使う純粋ロジック。Deno・Supabase・web-push に依存しないよう
// 切り出してあり、Vitestでテストできる(pushLogic.test.ts)。
// `supabase functions deploy` は相対importの_shared配下も同梱する。

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

// "21:00"のような"HH:MM"形式。
export function jstTimeNow(now: Date): string {
  return JST_TIME_FORMAT.format(now);
}

// en-CAロケールは"YYYY-MM-DD"を返す(DBのrecord_dateと同じ形式)。
export function jstDateNow(now: Date): string {
  return JST_DATE_FORMAT.format(now);
}

export interface GroupMembership {
  user_id: string;
  group_id: string;
}

// リマインド対象を返す。今夜(JST)、様子まで入った記録が**本人または同じグループの誰か**に
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

// 呼び出し元が pg_cron(= service role key を持つ側)かを確かめる。
// Supabase の JWT 検証(既定で有効)は、公開されている anon キーでも通してしまう。anon キーは
// アプリに埋め込まれていて誰でも知りうるため、そのままだと誰でもこの関数を呼べて、リマインドを
// 好きなタイミングで繰り返し発火させられる。cron が送る service role key と一致するときだけ通す。
export function isAuthorizedCall(authorizationHeader: string | null, serviceRoleKey: string): boolean {
  if (!authorizationHeader || !serviceRoleKey) return false;
  const match = /^Bearer (.+)$/.exec(authorizationHeader);
  if (!match) return false;
  const given = match[1] ?? "";
  // 長さが違うときも含め、比較時間が一致位置に左右されないようにする。
  let diff = given.length ^ serviceRoleKey.length;
  for (let i = 0; i < serviceRoleKey.length; i++) {
    diff |= (given.charCodeAt(i) || 0) ^ serviceRoleKey.charCodeAt(i);
  }
  return diff === 0;
}

// 410 Gone / 404 Not Found はブラウザ側で購読が失効したことを示す。
// それ以外(一時的な通信エラー等)は次回の実行に任せ、購読は残す。
export function isStaleSubscriptionError(error: unknown): boolean {
  const statusCode = (error as { statusCode?: number } | null | undefined)?.statusCode;
  return statusCode === 404 || statusCode === 410;
}

export function reminderPayload(): string {
  return JSON.stringify({ title: "よるノート", body: "今夜の記録がまだのようです", url: "/" });
}

// 通知文言の「〇〇さん」は、記録した人のメールアドレスの@より前(表示名を持たないための割り切り)。
export function displayNameFromEmail(email: string | undefined | null): string | null {
  const name = email?.split("@")[0]?.trim();
  return name ? name : null;
}

export function partnerRecordPayload(name: string | null): string {
  return JSON.stringify({
    title: "よるノート",
    body: name ? `${name}さんが今夜の記録を追加しました` : "パートナーが今夜の記録を追加しました",
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
