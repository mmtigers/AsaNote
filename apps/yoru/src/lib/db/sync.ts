import { getSupabaseClient } from "@note/core/supabase/client";
import type { DinnerState, MilestoneKey, Outcome, ResponseEffect } from "@/constants/choices";
import type { EveningRecord } from "@/types/models";
import { localDb, type LocalPhoto, type LocalRecord } from "./localDb";
import { reportSyncOutcome } from "./syncStatus";

let syncing = false;
let pulling = false;

const PHOTO_BUCKET = "evening-photos";

// pullの1ページあたりの取得件数。PostgRESTは1リクエストの最大行数(既定 max-rows=1000)を
// 黙って切り捨てるため、安定した順序でこの件数ずつ全ページ取得する。取得できなかった行を
// 「クラウドから見えなくなった」と誤判定してローカルから削除してしまうのを避けるため。
export const PULL_PAGE_SIZE = 500;

// 節目の key と DB の列名の対応。
const TIME_COLUMNS = {
  arrive: "t_arrive",
  hwStart: "t_hw_start",
  hwEnd: "t_hw_end",
  dinner: "t_dinner",
  bath: "t_bath",
  prep: "t_prep",
  bed: "t_bed",
} as const satisfies Record<MilestoneKey, string>;

type TimeColumn = (typeof TIME_COLUMNS)[MilestoneKey];

export interface EveningRecordRow {
  id: string;
  user_id: string;
  child_id: string | null;
  record_date: string;
  outcome: string | null;
  dinner: string | null;
  dinner_why: string[] | null;
  free_tags: string[] | null;
  friend_tags: string[] | null;
  trigger_tags: string[] | null;
  behavior_tags: string[] | null;
  response_tags: string[] | null;
  response_effect: string | null;
  body_tags: string[] | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

type TimeColumns = { [K in TimeColumn]: string | null };
type CloudRecordRow = EveningRecordRow & Partial<TimeColumns>;

interface CloudPhotoRow {
  id: string;
  record_id: string;
  user_id: string;
  storage_path: string;
  created_at: string;
}

/**
 * Postgres の `time` 列は `HH:MM:SS`(場合により小数秒付き)で返るが、アプリ内の表現は
 * `HH:MM` で統一している。そのまま持つと表示に秒が混入するため、pull 時に先頭5文字へ正規化する。
 */
export function normalizeTimeValue(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^\d{2}:\d{2}(:|$)/.test(value) ? value.slice(0, 5) : value;
}

// user_id は RLS の INSERT/UPDATE ポリシーが要求するため必須で付与する。
export function toRecordRow(record: LocalRecord, userId: string) {
  const times = Object.fromEntries(
    (Object.keys(TIME_COLUMNS) as MilestoneKey[]).map((key) => [TIME_COLUMNS[key], record.times[key] ?? null])
  ) as TimeColumns;
  return {
    id: record.id,
    user_id: userId,
    child_id: record.childId ?? null,
    record_date: record.recordDate,
    outcome: record.outcome,
    ...times,
    dinner: record.dinner,
    dinner_why: record.dinnerWhy,
    free_tags: record.free,
    friend_tags: record.friend,
    trigger_tags: record.trigger,
    behavior_tags: record.behavior,
    response_tags: record.response,
    response_effect: record.responseEffect,
    body_tags: record.body,
    memo: record.memo,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromRecordRow(row: CloudRecordRow): LocalRecord {
  const times: EveningRecord["times"] = {};
  for (const key of Object.keys(TIME_COLUMNS) as MilestoneKey[]) {
    const v = normalizeTimeValue(row[TIME_COLUMNS[key]]);
    if (v) times[key] = v;
  }
  return {
    id: row.id,
    recordDate: row.record_date,
    outcome: row.outcome as Outcome | null,
    times,
    dinner: row.dinner as DinnerState | null,
    dinnerWhy: row.dinner_why ?? [],
    free: row.free_tags ?? [],
    friend: row.friend_tags ?? [],
    trigger: row.trigger_tags ?? [],
    behavior: row.behavior_tags ?? [],
    response: row.response_tags ?? [],
    responseEffect: row.response_effect as ResponseEffect | null,
    body: row.body_tags ?? [],
    memo: row.memo,
    userId: row.user_id,
    childId: row.child_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncStatus: "synced",
  };
}

export function photoStoragePath(userId: string, recordId: string, photoId: string): string {
  return `${userId}/${recordId}/${photoId}.jpg`;
}

// 通信回復時に呼び出し、未送信の変更をクラウドへ送る。id はローカル生成の UUID をそのまま
// 使うため upsert で冪等に扱える。順序は 記録 → 写真 → 写真の削除 → 記録の削除。
// 写真は親の記録が先にクラウドへ存在している必要があるため、記録の後に送る。
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

    // 1. 記録
    const pendingRecords = await localDb.records.where("syncStatus").equals("pending").toArray();
    if (pendingRecords.length > 0) {
      hadWork = true;
      const rows = pendingRecords.map((r) => toRecordRow(r, userId));
      const { error } = await supabase.from("evening_records").upsert(rows);

      if (!error) {
        await localDb.records.bulkUpdate(
          pendingRecords.map((r) => ({ key: r.id, changes: { syncStatus: "synced" as const, userId } }))
        );
      } else {
        // 一括 upsert は1件でもエラーになると全体が失敗するため、失敗時のみ1件ずつ再試行し、
        // 問題のない他のレコードまで巻き込まれないようにする。
        console.warn(`evening_records一括同期に失敗しました(${pendingRecords.length}件)。1件ずつ再試行します:`, error);
        for (const record of pendingRecords) {
          const { error: rowError } = await supabase.from("evening_records").upsert(toRecordRow(record, userId));
          if (rowError) {
            console.warn(`evening_record同期に失敗しました(id=${record.id}):`, rowError);
            hadError = true;
          } else {
            await localDb.records.update(record.id, { syncStatus: "synced", userId });
          }
        }
      }
    }

    // 2. 写真(親の記録が同期済みのものだけ)。親の記録が端末に無い写真は、記録が保存されずに
    // 残った孤児なので、1日経ったら片づける。
    const pendingPhotos = await localDb.photos.where("syncStatus").equals("pending").toArray();
    for (const photo of pendingPhotos) {
      const parent = await localDb.records.get(photo.recordId);
      if (!parent) {
        if (Date.now() - new Date(photo.createdAt).getTime() > 24 * 60 * 60 * 1000) await localDb.photos.delete(photo.id);
        continue;
      }
      if (parent.syncStatus !== "synced" || !photo.blob) continue;
      hadWork = true;
      if (!(await uploadPhoto(photo, userId))) hadError = true;
    }

    // 3. 写真の削除(Storage の実体 → 行)
    const pendingPhotoDeletes = await localDb.pendingPhotoDeletes.toArray();
    if (pendingPhotoDeletes.length > 0) {
      hadWork = true;
      const { error: storageError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .remove(pendingPhotoDeletes.map((d) => d.storagePath));
      const { error: rowError } = await supabase
        .from("evening_photos")
        .delete()
        .in("id", pendingPhotoDeletes.map((d) => d.id));
      if (storageError || rowError) {
        console.warn("写真の削除の同期に失敗しました:", storageError ?? rowError);
        hadError = true;
      } else {
        await localDb.pendingPhotoDeletes.bulkDelete(pendingPhotoDeletes.map((d) => d.id));
      }
    }

    // 4. 記録の削除
    const pendingDeletes = await localDb.pendingRecordDeletes.toArray();
    if (pendingDeletes.length > 0) {
      hadWork = true;
      const ids = pendingDeletes.map((d) => d.id);
      const { error } = await supabase.from("evening_records").delete().in("id", ids);

      if (error) {
        console.warn(`evening_records削除の同期に失敗しました(${ids.length}件):`, error);
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

async function uploadPhoto(photo: LocalPhoto, userId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const path = photoStoragePath(userId, photo.recordId, photo.id);

  // 同じ id のやり直しでも壊れないよう upsert: true。アップロード後に行の追加が失敗しても、
  // 次回は同じパスへ上書きするだけで済む。
  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, photo.blob!, { contentType: "image/jpeg", upsert: true });
  if (uploadError) {
    console.warn(`写真のアップロードに失敗しました(id=${photo.id}):`, uploadError);
    return false;
  }

  const { error: rowError } = await supabase.from("evening_photos").upsert({
    id: photo.id,
    record_id: photo.recordId,
    user_id: userId,
    storage_path: path,
    created_at: photo.createdAt,
  });
  if (rowError) {
    console.warn(`写真の登録に失敗しました(id=${photo.id}):`, rowError);
    return false;
  }

  await localDb.photos.update(photo.id, { syncStatus: "synced", storagePath: path, userId });
  return true;
}

async function fetchAllPages<T>(table: string, orderBy: string): Promise<T[] | null> {
  const supabase = getSupabaseClient();
  const all: T[] = [];
  for (let from = 0; ; from += PULL_PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(orderBy, { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PULL_PAGE_SIZE - 1);
    if (error) {
      console.warn(`${table}のpullに失敗しました(offset=${from}):`, error);
      return null;
    }
    const page = (data ?? []) as T[];
    all.push(...page);
    if (page.length < PULL_PAGE_SIZE) break;
  }
  return all;
}

// クラウド→ローカルの取り込み(ログイン直後・起動時・グループ参加/脱退後に実行)。他端末
// (パートナーの端末)で記録したデータや、この端末のIndexedDBが空になった場合の復元に使う。
// ローカルにまだ送信していない変更(syncStatus: "pending")がある行は、クラウドの古い値で
// 上書きしないようスキップする。user_id での絞り込みは行わず RLS に委ねる
// (パートナーの記録もまとめてミラーする)。
//
// 取得は全ページ取得で、途中のページが失敗した場合はローカルへの反映も「見えなくなった行の削除」も
// 行わない(部分的な結果で削除判定すると、取得漏れの行が消えるため)。
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
    const remoteRecords = await fetchAllPages<CloudRecordRow>("evening_records", "record_date");
    const remotePhotos = remoteRecords ? await fetchAllPages<CloudPhotoRow>("evening_photos", "created_at") : null;
    if (!remoteRecords || !remotePhotos) {
      hadError = true;
      return;
    }

    const pendingDeleteIds = new Set((await localDb.pendingRecordDeletes.toArray()).map((d) => d.id));
    for (const row of remoteRecords) {
      if (pendingDeleteIds.has(row.id)) continue;
      const local = await localDb.records.get(row.id);
      if (local?.syncStatus === "pending") continue;
      await localDb.records.put(fromRecordRow(row));
    }

    // クラウド側(RLS)からもう見えなくなった記録をローカルからも削除する(グループ脱退・
    // 相手による削除・別端末での削除など)。未同期(pending)の行は自分のローカル変更なので対象外。
    const remoteIds = new Set(remoteRecords.map((r) => r.id));
    const staleRecords = (await localDb.records.where("syncStatus").equals("synced").toArray()).filter(
      (r) => !remoteIds.has(r.id)
    );
    if (staleRecords.length > 0) {
      await localDb.records.bulkDelete(staleRecords.map((r) => r.id));
    }

    // 写真: メタデータだけを取り込む(実体は表示時に署名付きURLで取得する)。端末に blob がある
    // 写真は上書きしない。クラウドから消えた同期済みの写真はローカルからも消す。
    const pendingPhotoDeleteIds = new Set((await localDb.pendingPhotoDeletes.toArray()).map((d) => d.id));
    for (const row of remotePhotos) {
      if (pendingPhotoDeleteIds.has(row.id)) continue;
      const local = await localDb.photos.get(row.id);
      if (local?.syncStatus === "pending") continue;
      await localDb.photos.put({
        id: row.id,
        recordId: row.record_id,
        blob: local?.blob,
        storagePath: row.storage_path,
        userId: row.user_id,
        createdAt: row.created_at,
        syncStatus: "synced",
      });
    }
    const remotePhotoIds = new Set(remotePhotos.map((p) => p.id));
    const stalePhotos = (await localDb.photos.where("syncStatus").equals("synced").toArray()).filter(
      (p) => !remotePhotoIds.has(p.id)
    );
    if (stalePhotos.length > 0) {
      await localDb.photos.bulkDelete(stalePhotos.map((p) => p.id));
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
