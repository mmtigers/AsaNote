import Dexie, { type Table } from "dexie";
import type { EveningRecord } from "@/types/models";

export type SyncStatus = "pending" | "synced";

export type LocalRecord = EveningRecord & { syncStatus: SyncStatus };

// 端末にある写真。blob は端末で撮った/選んだ写真だけが持つ(縮小済み)。他の端末や
// パートナーの写真は blob を持たず、storagePath から署名付きURLで表示する。
// storagePath はアップロード時(user_id が確定してから)に決まるので、それまでは空。
export interface LocalPhoto {
  id: string;
  recordId: string;
  blob?: Blob;
  storagePath: string;
  userId?: string | null;
  createdAt: string;
  syncStatus: SyncStatus;
}

// 同期済みの記録・写真を削除するとき、その場でリモート削除を試みずに一旦ここへ積み、
// sync.ts の通常サイクルでまとめて処理する(オフライン中の削除も再試行できるようにするため)。
export interface PendingRecordDelete {
  id: string;
}

export interface PendingPhotoDelete {
  id: string;
  storagePath: string;
}

// 端末がオフラインでも即座に保存できるよう、Supabaseと同じ形のデータをIndexedDBに
// ミラーリングし、通信回復時に syncStatus: "pending" のものだけを送る。
class YoruNoteDB extends Dexie {
  records!: Table<LocalRecord, string>;
  photos!: Table<LocalPhoto, string>;
  pendingRecordDeletes!: Table<PendingRecordDelete, string>;
  pendingPhotoDeletes!: Table<PendingPhotoDelete, string>;

  constructor() {
    super("yoru-note-db");
    this.version(1).stores({
      records: "id, recordDate, syncStatus",
      photos: "id, recordId, syncStatus",
      pendingRecordDeletes: "id",
      pendingPhotoDeletes: "id",
    });
  }
}

export const localDb = new YoruNoteDB();

// 共有端末で前ユーザーのローカルデータが残り、次にログインした別ユーザーの
// アカウントへ誤同期されるのを防ぐため、ログアウト時にこれを呼ぶ。
export async function clearLocalData(): Promise<void> {
  await localDb.transaction("rw", localDb.tables, async () => {
    await Promise.all(localDb.tables.map((table) => table.clear()));
  });
}

export type LocalDbHealth = { ok: true } | { ok: false; name: string; message: string };

const OPEN_TIMEOUT_MS = 8000;

// 端末のIndexedDBが使えるかを確かめる。使えない端末では、一覧や記録ボタンが何も起きないように
// 見えるだけで原因が分からないため、失敗(または一定時間応答なし)を画面に出すのに使う。
export async function checkLocalDb(): Promise<LocalDbHealth> {
  try {
    await Promise.race([
      localDb.open().then(() => localDb.records.count()),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error("端末のデータベースが応答しません"), { name: "Timeout" })), OPEN_TIMEOUT_MS)
      ),
    ]);
    return { ok: true };
  } catch (e) {
    const err = e as { name?: string; message?: string };
    return { ok: false, name: err?.name ?? "UnknownError", message: err?.message ?? String(e) };
  }
}
