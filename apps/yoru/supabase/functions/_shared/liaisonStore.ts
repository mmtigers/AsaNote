// LiaisonStore(liaisonHandler.ts)を、supabase-js(service role)で実装したもの。generate-liaison-memos/index.ts が使う。
// service role は RLS を通らないので、「その子どもが見える人」の範囲は liaisonHandler.ts が familyOf で絞る。
import type { ClaimCondition, LiaisonSettings, LiaisonStore, MemoPatch, MemoRow } from "./liaisonHandler.ts";

// supabase-js のクエリビルダーは型が大きいため、ここでは緩く扱う(この関数群は Edge Function の中だけで使う)。
// deno-lint-ignore no-explicit-any
type Query = any;
export interface SupabaseLike {
  from(table: string): Query;
}

async function rows<T>(query: Promise<{ data: T[] | null; error: unknown }>, what: string): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`${what}の取得に失敗しました`);
  return data ?? [];
}

async function one<T>(query: Promise<{ data: T | null; error: unknown }>, what: string): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw new Error(`${what}の取得に失敗しました`);
  return data ?? null;
}

// PostgREST の or() の値は、記号を含むので二重引用符で囲む。
const quoted = (value: string) => `"${value}"`;

const ASA_COLUMNS =
  "user_id, child_id, record_date, outcome, wake_time, wake_tags, depart_time, companion, handoff, trigger_tags, reason_tags, response_tags, memo";
const YORU_COLUMNS =
  "user_id, child_id, record_date, outcome, t_arrive, t_hw_start, t_bath, t_bed, dinner, dinner_why, free_tags, friend_tags, trigger_tags, behavior_tags, response_tags, response_effect, body_tags, memo";

export function createLiaisonStore(db: SupabaseLike): LiaisonStore {
  return {
    listEnabledSettings: () =>
      rows<LiaisonSettings>(db.from("liaison_memo_settings").select("*").eq("enabled", true), "liaison_memo_settings"),

    getSettings: (childId) =>
      one<LiaisonSettings>(db.from("liaison_memo_settings").select("*").eq("child_id", childId).maybeSingle(), "liaison_memo_settings"),

    getChild: (childId) =>
      one<{ id: string; name: string; created_by: string }>(
        db.from("children").select("id, name, created_by").eq("id", childId).maybeSingle(),
        "children"
      ),

    async familyOf(userId) {
      const membership = await one<{ group_id: string }>(
        db.from("group_members").select("group_id").eq("user_id", userId).maybeSingle(),
        "group_members"
      );
      if (!membership) return [userId];
      const members = await rows<{ user_id: string }>(
        db.from("group_members").select("user_id").eq("group_id", membership.group_id),
        "group_members"
      );
      return [...new Set([userId, ...members.map((m) => m.user_id)])];
    },

    childrenCreatedBy: (userIds) =>
      rows<{ id: string; name: string }>(db.from("children").select("id, name").in("created_by", userIds), "children"),

    getMemo: (childId, dueDate) =>
      one<MemoRow>(
        db.from("liaison_memos").select("*").eq("child_id", childId).eq("due_date", dueDate).maybeSingle(),
        "liaison_memos"
      ),

    async insertMemo(row) {
      const { data, error } = await db.from("liaison_memos").insert(row).select().single();
      if (error) {
        if ((error as { code?: string }).code === "23505") return null; // (child_id, due_date) の一意制約
        throw new Error("liaison_memos の作成に失敗しました");
      }
      return data as MemoRow;
    },

    claimMemo(id: string, condition: ClaimCondition, patch: MemoPatch) {
      let query = db.from("liaison_memos").update(patch).eq("id", id);
      if (condition.kind === "auto") {
        query = query
          .lt("attempts", condition.maxAttempts)
          .or(`status.eq.failed,and(status.eq.generating,locked_at.lt.${quoted(condition.staleBefore)})`);
      } else {
        query = query
          .eq("regenerate_count", condition.regenerateCount)
          .or(`status.neq.generating,locked_at.lt.${quoted(condition.staleBefore)}`);
      }
      return one<MemoRow>(query.select().maybeSingle(), "liaison_memos");
    },

    async updateMemo(id, patch) {
      const { error } = await db.from("liaison_memos").update(patch).eq("id", id);
      if (error) throw new Error("liaison_memos の更新に失敗しました");
    },

    asaRecords: (userIds, from, to) =>
      rows(
        db.from("records").select(ASA_COLUMNS).in("user_id", userIds).gte("record_date", from).lte("record_date", to).order("record_date"),
        "records"
      ),

    yoruRecords: (userIds, from, to) =>
      rows(
        db
          .from("evening_records")
          .select(YORU_COLUMNS)
          .in("user_id", userIds)
          .gte("record_date", from)
          .lte("record_date", to)
          .order("record_date"),
        "evening_records"
      ),

    rules: (userIds, from, to) =>
      rows(
        db
          .from("evening_rules")
          .select("title, child_id, started_on, ended_on")
          .in("user_id", userIds)
          .lte("started_on", to)
          .or(`ended_on.is.null,ended_on.gte.${from}`)
          .order("started_on"),
        "evening_rules"
      ),

    openConcerns: (userIds) =>
      rows(
        db.from("evening_concerns").select("title").in("user_id", userIds).is("resolved_at", null).order("created_at"),
        "evening_concerns"
      ),

    async sentTexts(childId, limit) {
      const data = await rows<{ final_text: string | null }>(
        db
          .from("liaison_memos")
          .select("final_text")
          .eq("child_id", childId)
          .not("sent_at", "is", null)
          .order("sent_at", { ascending: false })
          .limit(limit),
        "liaison_memos"
      );
      return data.map((r) => r.final_text).filter((t): t is string => !!t);
    },

    async subscriptionsFor(userIds) {
      // 通知設定の行が無い人も受け取る(既定ON)。notify_liaison_memo=false の人だけ除く。
      const settings = await rows<{ user_id: string; notify_liaison_memo: boolean }>(
        db.from("evening_notification_settings").select("user_id, notify_liaison_memo").in("user_id", userIds),
        "evening_notification_settings"
      );
      const optedOut = new Set(settings.filter((s) => s.notify_liaison_memo === false).map((s) => s.user_id));
      const targets = userIds.filter((id) => !optedOut.has(id));
      if (targets.length === 0) return [];
      return rows(
        db.from("evening_push_subscriptions").select("id, user_id, endpoint, p256dh, auth_key").in("user_id", targets),
        "evening_push_subscriptions"
      );
    },

    async deleteSubscriptions(ids) {
      await db.from("evening_push_subscriptions").delete().in("id", ids);
    },
  };
}
