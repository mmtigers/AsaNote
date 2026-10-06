import { localDb, type LocalRecord } from "./localDb";
import { isOwnRecord } from "./ownership";
import { syncPendingChanges } from "./sync";
import type { EveningRecord } from "@/types/models";

export type RecordFormInput = Omit<EveningRecord, "createdAt" | "updatedAt">;

// 「記録する」操作は即座にDexie(IndexedDB)へ書き込み、その後バックグラウンドで
// Supabaseへの同期を試みる(オフラインでも入力自体は必ず成功させるため)。
export async function saveRecord(input: RecordFormInput): Promise<void> {
  const now = new Date().toISOString();
  const existing = await localDb.records.get(input.id);

  const record: LocalRecord = {
    ...input,
    memo: input.memo?.trim() ? input.memo : null,
    // 同期後に付いた user_id を、編集の保存で落とさない。
    userId: input.userId ?? existing?.userId ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    syncStatus: "pending",
  };

  await localDb.records.put(record);
  void syncPendingChanges();
}

// 削除はその場でリモート削除せず一旦キューに積み、sync.ts の通常サイクルでまとめて処理する。
// syncStatus に関わらず必ず積む: 同期済みの記録を編集すると "pending" に戻るため、
// 「編集してから削除」した記録のリモート削除が漏れてクラウドに残り、次の pull で復活してしまう。
// 一度もクラウドに無かった id の削除はサーバー側で 0 件ヒットの no-op になるだけなので区別しない。
// 写真は、記録を消すと evening_photos の行は連鎖して消えるが Storage の実体は残るため、
// 同期済みの写真は実体の削除もキューに積む。
export async function deleteRecord(id: string): Promise<void> {
  const existing = await localDb.records.get(id);
  const photos = await localDb.photos.where("recordId").equals(id).toArray();

  await localDb.transaction("rw", localDb.records, localDb.photos, localDb.pendingRecordDeletes, localDb.pendingPhotoDeletes, async () => {
    await localDb.records.delete(id);
    await localDb.photos.bulkDelete(photos.map((p) => p.id));
    if (existing) {
      await localDb.pendingRecordDeletes.put({ id });
      for (const p of photos) {
        if (p.storagePath) await localDb.pendingPhotoDeletes.put({ id: p.id, storagePath: p.storagePath });
      }
    }
  });
  void syncPendingChanges();
}

// ホーム画面で選んだ日付の自分の記録が既にあれば、編集対象として読み込む(無ければ新規作成)。
// 同じ日付に複数件あれば直近のものを使う。childId は複数の子ども対応向け。子どもを登録して
// いない家庭では常に null で、その場合は childId 未設定の記録のみを対象にする。
export async function findLatestOwnRecordForDate(
  recordDate: string,
  userId: string | null,
  childId: string | null = null
): Promise<LocalRecord | undefined> {
  const candidates = await localDb.records.where("recordDate").equals(recordDate).toArray();
  const own = candidates.filter((r) => isOwnRecord(r, userId) && (r.childId ?? null) === childId);
  own.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return own[0];
}

// ログアウト前の確認などで使う、この端末にだけ存在してクラウドへ未反映の変更の件数。
export async function countUnsyncedChanges(): Promise<number> {
  const [records, photos, recordDeletes, photoDeletes] = await Promise.all([
    localDb.records.where("syncStatus").equals("pending").count(),
    localDb.photos.where("syncStatus").equals("pending").count(),
    localDb.pendingRecordDeletes.count(),
    localDb.pendingPhotoDeletes.count(),
  ]);
  return records + photos + recordDeletes + photoDeletes;
}
