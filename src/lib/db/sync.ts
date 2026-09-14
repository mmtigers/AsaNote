import { getSupabaseClient } from "@/lib/supabase/client";
import type { Outcome } from "@/constants/choices";
import type { SchoolRecord } from "@/types/models";
import type { Database } from "./database.types";
import { localDb, type LocalRecord } from "./localDb";
import { reportSyncOutcome } from "./syncStatus";

let syncing = false;
let pulling = false;

// user_idはRLSのINSERT/UPDATEポリシーが要求するため必須で付与する。
function toRecordRow(record: LocalRecord, userId: string) {
  return {
    id: record.id,
    user_id: userId,
    record_date: record.recordDate,
    outcome: record.outcome ?? null,
    wake_time: record.wakeTime,
    wake_tags: record.wakeTags,
    trigger_tags: record.triggerTags,
    reason_tags: record.reasonTags,
    response_tags: record.responseTags,
    depart_time: record.departTime,
    companion: record.companion,
    handoff: record.handoff,
    memo: record.memo,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

// supabase/schema.sqlとの型のズレを防ぐため、手書きせずsupabase gen types
// typescript(database.types.ts)から導出する。outcomeはDB上はただのtext列
// (アプリ側だけがOutcomeの3値に制限している)なので、生成された`string | null`
// をここでOutcomeへ絞り込む。
type CloudRecordRow = Database["public"]["Tables"]["records"]["Row"];

function fromRecordRow(row: CloudRecordRow): LocalRecord {
  const record: SchoolRecord = {
    id: row.id,
    recordDate: row.record_date,
    outcome: row.outcome as Outcome | null,
    wakeTime: row.wake_time,
    wakeTags: row.wake_tags ?? [],
    triggerTags: row.trigger_tags ?? [],
    reasonTags: row.reason_tags ?? [],
    responseTags: row.response_tags ?? [],
    departTime: row.depart_time,
    companion: row.companion,
    handoff: row.handoff,
    memo: row.memo,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return { ...record, syncStatus: "synced" };
}

// 通信回復時に呼び出し、syncStatus: "pending" の記録をクラウドへ送る。idはローカル
// 生成のUUIDをそのまま使うためupsertで冪等に扱える。
export async function syncPendingChanges() {
  if (syncing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  syncing = true;
  // 実際に送信を試みた場合だけ結果を報告する(未ログイン/送るものが無い場合は
  // 「同期に失敗している」わけではないため、失敗カウントに影響させない)。
  let hadWork = false;
  let hadError = false;
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return; // 未ログインの間はRLSにより書き込めないため同期しない

    const pendingRecords = await localDb.records.where("syncStatus").equals("pending").toArray();

    if (pendingRecords.length > 0) {
      hadWork = true;
      const rows = pendingRecords.map((r) => toRecordRow(r, userId));
      const { error } = await supabase.from("records").upsert(rows);

      if (!error) {
        await localDb.records.bulkUpdate(
          pendingRecords.map((r) => ({ key: r.id, changes: { syncStatus: "synced" as const } }))
        );
      } else {
        // 一括upsertは1件でもエラーになると全体が失敗するため、失敗時のみ1件ずつ
        // 再試行し、問題のない他のレコードまで巻き込まれないようにする。
        console.warn(`records一括同期に失敗しました(${pendingRecords.length}件)。1件ずつ再試行します:`, error);
        for (const record of pendingRecords) {
          const { error: rowError } = await supabase.from("records").upsert(toRecordRow(record, userId));
          if (rowError) {
            console.warn(`record同期に失敗しました(id=${record.id}):`, rowError);
            hadError = true;
          } else {
            await localDb.records.update(record.id, { syncStatus: "synced" });
          }
        }
      }
    }

    const pendingDeletes = await localDb.pendingRecordDeletes.toArray();
    if (pendingDeletes.length > 0) {
      hadWork = true;
      const ids = pendingDeletes.map((d) => d.id);
      const { error } = await supabase.from("records").delete().in("id", ids);

      if (error) {
        console.warn(`records削除の同期に失敗しました(${ids.length}件):`, error);
        hadError = true;
      } else {
        await localDb.pendingRecordDeletes.bulkDelete(ids);
      }
    }
  } catch (error) {
    console.warn("Supabaseへの同期をスキップしました:", error);
    hadWork = true;
    hadError = true;
  } finally {
    syncing = false;
    if (hadWork) reportSyncOutcome(!hadError);
  }
}

// クラウド→ローカルの取り込み(ログイン直後・起動時に一度実行)。他端末(パートナーの
// 端末)で記録したデータや、この端末のIndexedDBが空になった場合(再インストール等)の
// 復元に使う。ローカルにまだ送信していない変更(syncStatus: "pending")がある行は、
// クラウドの古い値で上書きしないようスキップする。
//
// recordsのSELECTポリシーは自分自身に加えて同じグループのメンバーの行も返すため、
// user_idでの絞り込みは行わずRLSに委ねる(パートナーの記録もまとめてDexieへミラーする)。
export async function pullFromCloud() {
  if (pulling) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  pulling = true;
  let hadWork = false;
  let hadError = false;
  try {
    const supabase = getSupabaseClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;

    hadWork = true;
    const { data, error } = await supabase.from("records").select("*");
    if (error) {
      console.warn("recordsのpullに失敗しました:", error);
      hadError = true;
      return;
    }
    const remoteRecords = (data ?? []) as CloudRecordRow[];

    const pendingDeleteIds = new Set((await localDb.pendingRecordDeletes.toArray()).map((d) => d.id));

    for (const row of remoteRecords) {
      if (pendingDeleteIds.has(row.id)) continue;
      const local = await localDb.records.get(row.id);
      if (local?.syncStatus === "pending") continue;
      await localDb.records.put(fromRecordRow(row));
    }

    // クラウド側(RLS)からもう見えなくなった記録をローカルからも削除する
    // (グループ脱退・相手による削除・別端末での削除などで可視範囲から外れた場合)。
    // 未同期(pending)の行は自分自身のローカル変更のため対象外にする。
    const remoteIds = new Set(remoteRecords.map((r) => r.id));
    const staleRecords = (await localDb.records.where("syncStatus").equals("synced").toArray()).filter(
      (r) => !remoteIds.has(r.id)
    );
    if (staleRecords.length > 0) {
      await localDb.records.bulkDelete(staleRecords.map((r) => r.id));
    }
  } catch (error) {
    console.warn("Supabaseからの取り込みをスキップしました:", error);
    hadWork = true;
    hadError = true;
  } finally {
    pulling = false;
    if (hadWork) reportSyncOutcome(!hadError);
  }
}

// 起動時とオンライン復帰時に同期をトリガーする。オフライン中の変更をキャッシュに残したまま
// バックグラウンドで送信するため、UI側の待ち時間は発生しない。
export function registerSyncListeners() {
  if (typeof window === "undefined") return;

  window.addEventListener("online", () => {
    void syncPendingChanges();
  });

  void syncPendingChanges();
}
