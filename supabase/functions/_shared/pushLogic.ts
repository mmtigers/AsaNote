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

// 今日(JST)、outcomeまで入った記録が既にあるユーザーを除いた、リマインド対象を返す。
export function selectReminderTargets(dueUserIds: string[], alreadyRecordedUserIds: Iterable<string>): string[] {
  const recorded = new Set(alreadyRecordedUserIds);
  return dueUserIds.filter((id) => !recorded.has(id));
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

// 呼び出し元が pg_cron かを、cron 専用の合言葉(`CRON_SECRET`)で確かめる。
// 以前は service role key との一致で確かめていたが、`SUPABASE_SERVICE_ROLE_KEY` は非推奨になり(JWT Signing
// Keys への移行後)、関数の中の値が、ダッシュボードの鍵と同じとは限らず、正しい鍵でも弾いてしまった。
// 専用の合言葉なら、Supabase の鍵の仕組みに左右されない。Supabase の JWT 検証(既定で有効)は、公開の anon
// キーでも通すため、これで「cron だけが呼べる」ようにしている。
// 短すぎる合言葉は、推測されやすいので、設定ミスとして通さない。
export const MIN_CRON_SECRET_LENGTH = 16;

export function isAuthorizedCron(givenSecret: string | null, cronSecret: string | undefined): boolean {
  if (!givenSecret || !cronSecret || cronSecret.length < MIN_CRON_SECRET_LENGTH) return false;
  // 長さが違うときも含め、比較時間が一致位置に左右されないようにする。
  let diff = givenSecret.length ^ cronSecret.length;
  for (let i = 0; i < cronSecret.length; i++) {
    diff |= (givenSecret.charCodeAt(i) || 0) ^ cronSecret.charCodeAt(i);
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
