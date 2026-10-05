"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { PHOTO_MAX_PER_RECORD } from "@/constants/choices";
import { compressImage } from "@/lib/image";
import { getSupabaseClient } from "@/lib/supabase/client";
import { localDb, type LocalPhoto } from "./localDb";
import { syncPendingChanges } from "./sync";

export class PhotoLimitError extends Error {
  constructor() {
    super(`写真は1日${PHOTO_MAX_PER_RECORD}枚までです`);
  }
}

// フォームで選んだ写真を縮小して端末に保存する。記録の保存を待たずに保存するため、
// 記録が保存されないまま閉じられた写真は discardUnsavedPhotos で片づける。
// 親の記録が同期されるまでアップロードしない(sync.ts)。
export async function addPhoto(recordId: string, file: Blob): Promise<LocalPhoto> {
  const existing = await localDb.photos.where("recordId").equals(recordId).count();
  if (existing >= PHOTO_MAX_PER_RECORD) throw new PhotoLimitError();

  const blob = await compressImage(file);
  const photo: LocalPhoto = {
    id: crypto.randomUUID(),
    recordId,
    blob,
    storagePath: "",
    createdAt: new Date().toISOString(),
    syncStatus: "pending",
  };
  await localDb.photos.put(photo);
  return photo;
}

export async function removePhoto(id: string): Promise<void> {
  const photo = await localDb.photos.get(id);
  if (!photo) return;
  await localDb.transaction("rw", localDb.photos, localDb.pendingPhotoDeletes, async () => {
    await localDb.photos.delete(id);
    // クラウドに上がっている写真は、実体と行の削除をキューに積む。
    if (photo.syncStatus === "synced" && photo.storagePath) {
      await localDb.pendingPhotoDeletes.put({ id, storagePath: photo.storagePath });
    }
  });
  void syncPendingChanges();
}

/**
 * 記録が保存されないままフォームを閉じたとき、その記録に紐づく**未アップロードの写真**を消す。
 * 保存済みの記録がある場合(編集の途中で閉じた場合)は、その記録に既にあった写真は残し、
 * 今回の編集で追加した写真(keepIds に無い pending)だけを消す。keepIds は、フォームを開いた時点で
 * 既にあった写真のid。
 */
export async function discardUnsavedPhotos(recordId: string, keepIds: ReadonlySet<string>): Promise<void> {
  const photos = await localDb.photos.where("recordId").equals(recordId).toArray();
  const drop = photos.filter((p) => p.syncStatus === "pending" && !keepIds.has(p.id));
  await localDb.photos.bulkDelete(drop.map((p) => p.id));
}

export function useRecordPhotos(recordId: string | null): LocalPhoto[] | undefined {
  return useLiveQuery(
    async () => (recordId ? (await localDb.photos.where("recordId").equals(recordId).sortBy("createdAt")) : []),
    [recordId]
  );
}

const SIGNED_URL_TTL_SECONDS = 60 * 60;

// 表示用のURL。端末に blob があればそれを使い、無ければ(他の端末・パートナーの写真)
// 非公開バケットの署名付きURLを取得する。呼び出し側は使い終わったら blob 由来のURLを revoke すること。
export async function getPhotoUrl(photo: LocalPhoto): Promise<{ url: string; revoke: boolean } | null> {
  if (photo.blob) return { url: URL.createObjectURL(photo.blob), revoke: true };
  if (!photo.storagePath) return null;
  const { data, error } = await getSupabaseClient().storage.from("evening-photos").createSignedUrl(photo.storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return { url: data.signedUrl, revoke: false };
}
