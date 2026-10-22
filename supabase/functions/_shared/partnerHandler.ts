// notify-partner / notify-comment の本体。reminderHandler.ts と同じく、DB・送信関数・作成者のメール取得を引数で受け取るので、
// Vitest で「誰に送るか・送らないか」を通しで確かめられる(partnerHandler.test.ts)。
// index.ts は環境変数・合言葉・リクエストの読み取りと、本物のクライアントの組み立てだけを行う。
//
// 処理の流れ:
//   1. 記録した人(authorId)と同じグループの、本人以外のメンバーを探す。
//   2. そのうち notification_settings の該当列(きろく追加: notify_partner_record、コメント: notify_partner_comment)が
//      true のメンバーの全購読へ送る。
//   3. 通知文言の「〇〇さん」は記録した人のメールアドレスの@より前(表示名を持たないための割り切り)。
//      送信に失敗した購読(410/404)はその場で削除する。
import {
  displayNameFromEmail,
  partnerCommentPayload,
  partnerRecordPayload,
  sendToSubscriptions,
  type PushSubscriptionRow,
  type SendNotification,
} from "./pushLogic.ts";
import type { ReminderResult } from "./reminderHandler.ts";

type Row = Record<string, unknown>;
interface QueryResult {
  data: Row[] | null;
  error: unknown;
}

// supabase-js のうち、この関数が使う呼び出しだけを写した最小の型。
export interface PartnerQuery extends PromiseLike<QueryResult> {
  eq(column: string, value: unknown): PartnerQuery;
  neq(column: string, value: unknown): PartnerQuery;
  in(column: string, values: string[]): PartnerQuery;
  maybeSingle(): PromiseLike<{ data: Row | null; error: unknown }>;
}
export interface PartnerDb {
  from(table: string): {
    select(columns: string): PartnerQuery;
    delete(): { in(column: string, values: string[]): PromiseLike<{ error: unknown }> };
  };
}

// 通知の種類ごとの違い: 受信者のどの設定列を見るか、通知の文言。
// コメント通知は notify-comment が、きろく追加の通知は notify-partner が使う(誰に送るかの判定は共通)。
export type PartnerNotifyKind = "record" | "comment";
const KINDS = {
  record: { settingsColumn: "notify_partner_record", payload: partnerRecordPayload },
  comment: { settingsColumn: "notify_partner_comment", payload: partnerCommentPayload },
} as const;

const fail = (what: string): ReminderResult => ({ status: 500, body: `failed to load ${what}` });

export async function runPartnerNotify(
  db: PartnerDb,
  send: SendNotification,
  authorId: string,
  getAuthorEmail: (userId: string) => Promise<string | null | undefined>,
  kind: PartnerNotifyKind = "record"
): Promise<ReminderResult> {
  const { settingsColumn, payload } = KINDS[kind];
  const { data: membership, error: membershipError } = await db
    .from("group_members")
    .select("group_id")
    .eq("user_id", authorId)
    .maybeSingle();
  if (membershipError) {
    console.error("group_membersの取得に失敗しました:", membershipError);
    return fail("group_members");
  }
  if (!membership) return { status: 200, body: { partners: 0, sent: 0 } };

  const { data: members, error: membersError } = await db
    .from("group_members")
    .select("user_id")
    .eq("group_id", membership.group_id)
    .neq("user_id", authorId);
  if (membersError) {
    console.error("group_membersの取得に失敗しました:", membersError);
    return fail("group members");
  }
  const partnerIds = (members ?? []).map((row) => row.user_id as string);
  if (partnerIds.length === 0) return { status: 200, body: { partners: 0, sent: 0 } };

  const { data: settings, error: settingsError } = await db
    .from("notification_settings")
    .select("user_id")
    .eq(settingsColumn, true)
    .in("user_id", partnerIds);
  if (settingsError) {
    console.error("notification_settingsの取得に失敗しました:", settingsError);
    return fail("notification_settings");
  }
  const targetIds = (settings ?? []).map((row) => row.user_id as string);
  if (targetIds.length === 0) return { status: 200, body: { partners: partnerIds.length, sent: 0 } };

  const { data: subscriptions, error: subscriptionsError } = await db
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .in("user_id", targetIds);
  if (subscriptionsError) {
    console.error("push_subscriptionsの取得に失敗しました:", subscriptionsError);
    return fail("push_subscriptions");
  }

  const name = displayNameFromEmail(await getAuthorEmail(authorId));
  const { sent, staleSubscriptionIds } = await sendToSubscriptions(
    send,
    (subscriptions ?? []) as unknown as PushSubscriptionRow[],
    payload(name)
  );

  if (staleSubscriptionIds.length > 0) {
    await db.from("push_subscriptions").delete().in("id", staleSubscriptionIds);
  }

  return { status: 200, body: { partners: partnerIds.length, targeted: targetIds.length, sent } };
}
