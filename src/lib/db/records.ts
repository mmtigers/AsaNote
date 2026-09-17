import type { Outcome } from "@/constants/choices";
import { localDb, type LocalRecord } from "./localDb";
import { syncPendingChanges } from "./sync";

export interface RecordFormInput {
  id: string;
  recordDate: string;
  outcome?: Outcome | null;
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
  childId?: string | null;
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

// 削除はその場でリモート削除せず一旦pendingRecordDeletesに積み、sync.tsの通常サイクルで
// まとめて処理する(オフライン中の削除も再試行できるようにするため)。
// syncStatusに関わらず必ず積む(#56): 以前は "synced" の行だけを積んでいたが、同期済みの記録を
// 編集すると "pending" に戻るため、「編集してから削除」した記録はリモート削除がキューされず
// クラウドに残り、次回のpullでローカルに復活していた。一度もクラウドに存在しなかったidの
// 削除はサーバー側で0件ヒットの no-op になるだけなので、区別せず全件積んでよい。
export async function deleteRecord(id: string): Promise<void> {
  const existing = await localDb.records.get(id);
  await localDb.records.delete(id);
  if (existing) {
    await localDb.pendingRecordDeletes.put({ id });
  }
  void syncPendingChanges();
}

// ホーム画面で「今日の記録」を開いたときに、その日付の自分の記録が既にあれば
// 編集対象として読み込む(無ければ新規作成)。同じ日付に複数件あれば直近のものを使う。
// childIdは複数の子ども対応(#3)向け。子どもを登録していない家庭では常にnullで、
// その場合はchildId未設定(旧来)の記録のみを対象にする。
export async function findLatestOwnRecordForDate(
  recordDate: string,
  userId: string | null,
  childId: string | null = null
): Promise<LocalRecord | undefined> {
  const candidates = await localDb.records.where("recordDate").equals(recordDate).toArray();
  const own = candidates.filter((r) => (!r.userId || r.userId === userId) && (r.childId ?? null) === childId);
  own.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return own[0];
}

// ログアウト前の確認(#58)などで使う、この端末にだけ存在してクラウドへ未反映の変更の件数。
// 未送信の記録(syncStatus: "pending")と、未反映の削除(pendingRecordDeletes)の合計。
export async function countUnsyncedChanges(): Promise<number> {
  const [pendingRecords, pendingDeletes] = await Promise.all([
    localDb.records.where("syncStatus").equals("pending").count(),
    localDb.pendingRecordDeletes.count(),
  ]);
  return pendingRecords + pendingDeletes;
}
