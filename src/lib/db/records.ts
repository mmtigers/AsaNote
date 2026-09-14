import { localDb, type LocalRecord } from "./localDb";
import { syncPendingChanges } from "./sync";

export interface RecordFormInput {
  id: string;
  recordDate: string;
  wakeTime: string | null;
  wakeTags: string[];
  triggerTags: string[];
  reasonTags: string[];
  responseTags: string[];
  departTime: string | null;
  companion: string | null;
  handoff: string | null;
  memo: string | null;
  userId?: string | null;
}

// 「記録する」操作は即座にDexie(IndexedDB)へ書き込み、その後バックグラウンドで
// Supabaseへの同期を試みる(オフラインでも入力自体は必ず成功させるため)。
export async function saveRecord(input: RecordFormInput): Promise<void> {
  const now = new Date().toISOString();
  const existing = await localDb.records.get(input.id);

  const record: LocalRecord = {
    ...input,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    syncStatus: "pending",
  };

  await localDb.records.put(record);
  void syncPendingChanges();
}

// 既に同期済み(syncStatus: "synced")の行は、その場でリモート削除せず一旦
// pendingRecordDeletesに積み、sync.tsの通常サイクルでまとめて処理する
// (オフライン中の削除も再試行できるようにするため)。
export async function deleteRecord(id: string): Promise<void> {
  const existing = await localDb.records.get(id);
  await localDb.records.delete(id);
  if (existing?.syncStatus === "synced") {
    await localDb.pendingRecordDeletes.put({ id });
  }
  void syncPendingChanges();
}

// ホーム画面で「今日の記録」を開いたときに、その日付の自分の記録が既にあれば
// 編集対象として読み込む(無ければ新規作成)。同じ日付に複数件あれば直近のものを使う。
export async function findLatestOwnRecordForDate(
  recordDate: string,
  userId: string | null
): Promise<LocalRecord | undefined> {
  const candidates = await localDb.records.where("recordDate").equals(recordDate).toArray();
  const own = candidates.filter((r) => !r.userId || r.userId === userId);
  own.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return own[0];
}
