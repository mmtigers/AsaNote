import Dexie, { type Table } from "dexie";
import type { SchoolRecord } from "@/types/models";

export type SyncStatus = "pending" | "synced";

export type LocalRecord = SchoolRecord & { syncStatus: SyncStatus };

// 既にSupabaseへ同期済み(syncStatus: "synced")の記録を削除する際、その場でリモート
// 削除を試みるのではなく一旦ここに積み、sync.tsの通常サイクルでまとめて処理する
// (オフライン中の削除も再試行できるようにするため)。
export interface PendingRecordDelete {
  id: string;
}

// 端末がオフラインでも即座に保存できるよう、Supabaseと同じ形のレコードをIndexedDB
// にミラーリングし、通信回復時にsyncStatus: "pending"のものだけを送る。
class AsaNoteDB extends Dexie {
  records!: Table<LocalRecord, string>;
  pendingRecordDeletes!: Table<PendingRecordDelete, string>;

  constructor() {
    super("asa-note-db");
    this.version(1).stores({
      records: "id, recordDate, syncStatus",
      pendingRecordDeletes: "id",
    });
  }
}

export const localDb = new AsaNoteDB();

// 共有端末で前ユーザーのローカルデータが残り、次にログインした別ユーザーの
// アカウントへ誤同期されるのを防ぐため、ログアウト時にこれを呼ぶ。
export async function clearLocalData(): Promise<void> {
  await localDb.transaction("rw", localDb.tables, async () => {
    await Promise.all(localDb.tables.map((table) => table.clear()));
  });
}
