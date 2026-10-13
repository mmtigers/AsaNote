// send-reminders の本体。Deno・Supabase・web-push に依存せず、DB と送信関数を引数で受け取るので、
// Vitest で「いつ誰に送るか・二重送信を防ぐ印・失敗時の印の解除」を通しで確かめられる(reminderHandler.test.ts)。
// index.ts は環境変数の読み取りと、本物のクライアントの組み立てだけを行う(よるノートの reminderHandler.ts と同じ形)。
//
// 処理の流れ:
//   1. enabled=trueのユーザーのうち、現在のJST時刻が reminder_time 以降で、直近
//      REMINDER_CATCHUP_WINDOW_MINUTES(15)分以内、かつ今日まだ送っていない(reminder_deliveries
//      に今日の行が無い)ユーザーを探す。cron/関数が1分欠けても、次の分以降で取り戻すため(#130)。
//   2. 「今日(JST)」の記録にoutcomeが入っていれば、本人または同じグループの誰でも、何もしない
//      (アプリ内リマインダーRecordReminderNoticeと同じ「未入力なら知らせる」方針)。
//   3. 未入力なら、reminder_deliveries に「今日送信済み」の行を入れて(主キー衝突で二重送信を防ぐ。
//      入れられた=自分が担当したユーザーだけが送る)、そのユーザーのpush_subscriptions全件へ通知を送る。
//      購読があるのに1件も送れなかったユーザーは、行を消して次の分に再試行させる。
//      送信に失敗した購読(410 Gone等、失効した購読)はその場で削除する。
import {
  jstDateNow,
  reminderPayload,
  selectDueReminderUserIds,
  selectReminderTargets,
  selectUsersToRelease,
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
interface DeleteResult {
  error: unknown;
}

// supabase-js のうち、この関数が使う呼び出しだけを写した最小の型。
export interface ReminderQuery extends PromiseLike<QueryResult> {
  eq(column: string, value: unknown): ReminderQuery;
  in(column: string, values: string[]): ReminderQuery;
  not(column: string, operator: string, value: unknown): ReminderQuery;
}
export interface ReminderDb {
  from(table: string): {
    select(columns: string): ReminderQuery;
    upsert(
      rows: Row[],
      options: { onConflict: string; ignoreDuplicates: boolean }
    ): { select(columns: string): PromiseLike<QueryResult> };
    delete(): {
      in(column: string, values: string[]): PromiseLike<DeleteResult>;
      eq(column: string, value: unknown): { in(column: string, values: string[]): PromiseLike<DeleteResult> };
    };
  };
}

export interface ReminderResult {
  status: number;
  // 200 のときは集計(JSON)、失敗のときはメッセージ。
  body: Record<string, number> | string;
}

const fail = (table: string): ReminderResult => ({ status: 500, body: `failed to load ${table}` });

export async function runReminders(db: ReminderDb, send: SendNotification, now: Date): Promise<ReminderResult> {
  const today = jstDateNow(now);

  const { data: enabledSettings, error: settingsError } = await db
    .from("notification_settings")
    .select("user_id, reminder_time")
    .eq("enabled", true);
  if (settingsError) {
    console.error("notification_settingsの取得に失敗しました:", settingsError);
    return fail("notification_settings");
  }

  const { data: sentToday, error: sentError } = await db.from("reminder_deliveries").select("user_id").eq("sent_on", today);
  if (sentError) {
    console.error("reminder_deliveriesの取得に失敗しました:", sentError);
    return fail("reminder_deliveries");
  }

  const dueUserIds = selectDueReminderUserIds(
    (enabledSettings ?? []) as unknown as { user_id: string; reminder_time: string }[],
    now,
    (sentToday ?? []).map((row) => row.user_id as string)
  );
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

  // 今日(JST)、outcomeまで入った記録が本人または同じグループの誰かに既にあれば、対象から除く。
  const { data: todaysRecords, error: recordsError } = await db
    .from("records")
    .select("user_id")
    .eq("record_date", today)
    .not("outcome", "is", null)
    .in("user_id", involvedUserIds);
  if (recordsError) {
    console.error("recordsの取得に失敗しました:", recordsError);
    return fail("records");
  }

  const candidateUserIds = selectReminderTargets(
    dueUserIds,
    (todaysRecords ?? []).map((row) => row.user_id as string),
    memberships
  );
  if (candidateUserIds.length === 0) return { status: 200, body: { checked: dueUserIds.length, sent: 0 } };

  // 「今日送信済み」の印を先に付け、付けられた(=他の実行に先を越されなかった)ユーザーだけに送る。
  // 既存の行は ignoreDuplicates でスキップされ、返ってくるのは新規に入れた行だけ。
  const { data: claimed, error: claimError } = await db
    .from("reminder_deliveries")
    .upsert(
      candidateUserIds.map((user_id) => ({ user_id, sent_on: today })),
      { onConflict: "user_id,sent_on", ignoreDuplicates: true }
    )
    .select("user_id");
  if (claimError) {
    console.error("reminder_deliveriesへの記録に失敗しました:", claimError);
    return { status: 500, body: "failed to record reminder_deliveries" };
  }
  const targetUserIds = (claimed ?? []).map((row) => row.user_id as string);
  if (targetUserIds.length === 0) return { status: 200, body: { checked: dueUserIds.length, targeted: 0, sent: 0 } };

  const { data: subscriptions, error: subscriptionsError } = await db
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth_key")
    .in("user_id", targetUserIds);
  if (subscriptionsError) {
    console.error("push_subscriptionsの取得に失敗しました:", subscriptionsError);
    // 印だけ残ると今日は届かなくなるので、外して次の分に再試行させる。
    await db.from("reminder_deliveries").delete().eq("sent_on", today).in("user_id", targetUserIds);
    return fail("push_subscriptions");
  }

  const subscriptionRows = (subscriptions ?? []) as unknown as (PushSubscriptionRow & { user_id: string })[];
  const idByEndpoint = new Map(subscriptionRows.map((row) => [row.endpoint, row.id]));
  const sentSubscriptionIds: string[] = [];
  const { sent, staleSubscriptionIds } = await sendToSubscriptions(
    async (subscription, payload) => {
      await send(subscription, payload);
      const id = idByEndpoint.get(subscription.endpoint);
      if (id) sentSubscriptionIds.push(id);
    },
    subscriptionRows,
    reminderPayload()
  );

  // 購読があるのに1件も届かなかったユーザー(一時的な通信エラー等)は、印を外して次の分に再試行する。
  const releaseUserIds = selectUsersToRelease(subscriptionRows, sentSubscriptionIds);
  if (releaseUserIds.length > 0) {
    await db.from("reminder_deliveries").delete().eq("sent_on", today).in("user_id", releaseUserIds);
  }

  if (staleSubscriptionIds.length > 0) {
    await db.from("push_subscriptions").delete().in("id", staleSubscriptionIds);
  }

  return { status: 200, body: { checked: dueUserIds.length, targeted: targetUserIds.length, sent } };
}
