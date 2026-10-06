// send-evening-reminders の本体。Deno・Supabase・web-push に依存せず、DB と送信関数を
// 引数で受け取るので、Vitest で「いつ誰に送るか」を通しで確かめられる(reminderHandler.test.ts)。
// index.ts は環境変数の読み取りと、本物のクライアントの組み立てだけを行う。
import {
  jstDateNow,
  jstTimeNow,
  reminderPayload,
  selectReminderTargets,
  sendToSubscriptions,
  type GroupMembership,
  type PushSubscriptionRow,
  type SendNotification,
} from "./pushLogic.ts";

type Row = Record<string, unknown>;
interface QueryResult {
  data: Row[] | null;
  error: unknown;
}

// supabase-js のうち、この関数が使う呼び出しだけを写した最小の型。
export interface ReminderQuery extends PromiseLike<QueryResult> {
  eq(column: string, value: unknown): ReminderQuery;
  neq(column: string, value: unknown): ReminderQuery;
  in(column: string, values: string[]): ReminderQuery;
  not(column: string, operator: string, value: unknown): ReminderQuery;
}
export interface ReminderDb {
  from(table: string): {
    select(columns: string): ReminderQuery;
    delete(): { in(column: string, values: string[]): PromiseLike<{ error: unknown }> };
  };
}

export interface ReminderResult {
  status: number;
  // 200 のときは集計(JSON)、失敗のときはメッセージ。
  body: Record<string, number> | string;
}

const fail = (table: string): ReminderResult => ({ status: 500, body: `failed to load ${table}` });

export async function runReminders(db: ReminderDb, send: SendNotification, now: Date): Promise<ReminderResult> {
  const currentTime = jstTimeNow(now);
  const today = jstDateNow(now);

  const { data: dueSettings, error: settingsError } = await db
    .from("evening_notification_settings")
    .select("user_id")
    .eq("enabled", true)
    .eq("reminder_time", `${currentTime}:00`);
  if (settingsError) {
    console.error("evening_notification_settingsの取得に失敗しました:", settingsError);
    return fail("evening_notification_settings");
  }

  const dueUserIds = (dueSettings ?? []).map((row) => row.user_id as string);
  if (dueUserIds.length === 0) return { status: 200, body: { checked: 0, sent: 0 } };

  // 同じグループの人が記録済みかも見るため、due ユーザーの所属グループとその全メンバーを集める。
  const { data: ownMemberships, error: ownMembershipsError } = await db
    .from("group_members")
    .select("user_id, group_id")
    .in("user_id", dueUserIds);
  if (ownMembershipsError) {
    console.error("group_membersの取得に失敗しました:", ownMembershipsError);
    return fail("group_members");
  }
  const groupIds = [...new Set((ownMemberships ?? []).map((m) => m.group_id as string))];
  const { data: groupMemberships, error: groupMembershipsError } = groupIds.length
    ? await db.from("group_members").select("user_id, group_id").in("group_id", groupIds)
    : { data: [] as Row[], error: null };
  if (groupMembershipsError) {
    console.error("group_membersの取得に失敗しました:", groupMembershipsError);
    return fail("group_members");
  }
  const memberships = (groupMemberships ?? []) as unknown as GroupMembership[];
  const involvedUserIds = [...new Set([...dueUserIds, ...memberships.map((m) => m.user_id)])];

  const { data: todaysRecords, error: recordsError } = await db
    .from("evening_records")
    .select("user_id")
    .eq("record_date", today)
    .not("outcome", "is", null)
    .in("user_id", involvedUserIds);
  if (recordsError) {
    console.error("evening_recordsの取得に失敗しました:", recordsError);
    return fail("evening_records");
  }

  const targetUserIds = selectReminderTargets(
    dueUserIds,
    (todaysRecords ?? []).map((row) => row.user_id as string),
    memberships
  );
  if (targetUserIds.length === 0) return { status: 200, body: { checked: dueUserIds.length, sent: 0 } };

  const { data: subscriptions, error: subscriptionsError } = await db
    .from("evening_push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth_key")
    .in("user_id", targetUserIds);
  if (subscriptionsError) {
    console.error("evening_push_subscriptionsの取得に失敗しました:", subscriptionsError);
    return fail("evening_push_subscriptions");
  }

  const { sent, staleSubscriptionIds } = await sendToSubscriptions(
    send,
    (subscriptions ?? []) as unknown as PushSubscriptionRow[],
    reminderPayload()
  );

  if (staleSubscriptionIds.length > 0) {
    await db.from("evening_push_subscriptions").delete().in("id", staleSubscriptionIds);
  }

  return { status: 200, body: { checked: dueUserIds.length, targeted: targetUserIds.length, sent } };
}
