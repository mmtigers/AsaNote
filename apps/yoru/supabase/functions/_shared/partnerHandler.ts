// notify-evening-partner / notify-evening-comment の本体。reminderHandler.ts と同じく、DB・送信関数・作成者のメール取得を
// 引数で受け取るので Vitest で通しで確かめられる(partnerHandler.test.ts)。
import {
  displayNameFromEmail,
  partnerCommentPayload,
  partnerRecordPayload,
  sendToSubscriptions,
  type PushSubscriptionRow,
  type SendNotification,
} from "./pushLogic.ts";
import type { ReminderDb, ReminderResult } from "./reminderHandler.ts";

type Row = Record<string, unknown>;

// 通知の種類ごとの違い: 受信者のどの設定列を見るか、通知の文言。
// コメント通知は notify-evening-comment が、記録追加の通知は notify-evening-partner が使う(誰に送るかの判定は共通)。
export type PartnerNotifyKind = "record" | "comment";
const KINDS = {
  record: { settingsColumn: "notify_partner_record", payload: partnerRecordPayload },
  comment: { settingsColumn: "notify_partner_comment", payload: partnerCommentPayload },
} as const;

const fail = (table: string): ReminderResult => ({ status: 500, body: `failed to load ${table}` });

// 記録した人(authorId)の同じグループの、本人以外のメンバーのうち該当する通知(記録追加: notify_partner_record、コメント: notify_partner_comment)をONにした人の
// 全購読へ送る。あさノートの notification_settings / push_subscriptions ではなく evening_* の表だけを見る。
export async function runPartnerNotify(
  db: ReminderDb,
  send: SendNotification,
  authorId: string,
  getAuthorEmail: (userId: string) => Promise<string | null | undefined>,
  kind: PartnerNotifyKind = "record"
): Promise<ReminderResult> {
  const { settingsColumn, payload } = KINDS[kind];
  const { data: ownMemberships, error: ownError } = await db
    .from("group_members")
    .select("group_id")
    .eq("user_id", authorId);
  if (ownError) {
    console.error("group_membersの取得に失敗しました:", ownError);
    return fail("group_members");
  }
  const groupId = (ownMemberships as Row[] | null)?.[0]?.group_id as string | undefined;
  if (!groupId) return { status: 200, body: { partners: 0, sent: 0 } };

  const { data: members, error: membersError } = await db
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .neq("user_id", authorId);
  if (membersError) {
    console.error("group_membersの取得に失敗しました:", membersError);
    return fail("group members");
  }
  const partnerIds = (members ?? []).map((row) => row.user_id as string);
  if (partnerIds.length === 0) return { status: 200, body: { partners: 0, sent: 0 } };

  const { data: settings, error: settingsError } = await db
    .from("evening_notification_settings")
    .select("user_id")
    .eq(settingsColumn, true)
    .in("user_id", partnerIds);
  if (settingsError) {
    console.error("evening_notification_settingsの取得に失敗しました:", settingsError);
    return fail("evening_notification_settings");
  }
  const targetIds = (settings ?? []).map((row) => row.user_id as string);
  if (targetIds.length === 0) return { status: 200, body: { partners: partnerIds.length, sent: 0 } };

  const { data: subscriptions, error: subscriptionsError } = await db
    .from("evening_push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .in("user_id", targetIds);
  if (subscriptionsError) {
    console.error("evening_push_subscriptionsの取得に失敗しました:", subscriptionsError);
    return fail("evening_push_subscriptions");
  }

  const name = displayNameFromEmail(await getAuthorEmail(authorId));
  const { sent, staleSubscriptionIds } = await sendToSubscriptions(
    send,
    (subscriptions ?? []) as unknown as PushSubscriptionRow[],
    payload(name)
  );

  if (staleSubscriptionIds.length > 0) {
    await db.from("evening_push_subscriptions").delete().in("id", staleSubscriptionIds);
  }

  return { status: 200, body: { partners: partnerIds.length, targeted: targetIds.length, sent } };
}
