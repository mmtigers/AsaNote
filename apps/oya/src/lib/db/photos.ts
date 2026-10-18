import { PHOTO_BUCKET } from "@/lib/photos";
import { db } from "@/lib/supabase";

// 孫の写真の管理(家族管理者だけ。SPEC §5)。権限の検証はサーバー(oya_photos と Storage の RLS)が行う。
//   - 実体は非公開バケットの {family_id}/{id}.jpg。行(oya_photos)が抽選の対象で、active = false の写真は
//     これからの抽選に使わない(すでに表示した親は見返せる)。
//   - 追加は「ファイルを置く → 行を作る」の順。行が作れなければ、置いたファイルを消す。
//   - 削除は「行を消す → ファイルを消す」の順。行が消えた時点で抽選にも見返しにも出なくなる。

export interface Photo {
  id: string;
  storagePath: string;
  active: boolean;
  createdAt: string;
}

/** 0件だったとき(権限が無い・すでに消えている)のエラー。RLS は拒否を0件として返すため、こちらで気づく。 */
export class PhotoNotFoundError extends Error {
  readonly code = "photo_not_found";
  constructor() {
    super("photo_not_found");
    this.name = "PhotoNotFoundError";
  }
}

export function photoPath(familyId: string, photoId: string): string {
  return `${familyId}/${photoId}.jpg`;
}

/** 家族の写真(新しい順)。家族管理者・閲覧者は家族の写真をすべて、親は自分に表示された写真だけが返る。 */
export async function fetchFamilyPhotos(): Promise<Photo[]> {
  const { data, error } = await db()
    .from("oya_photos")
    .select("id, storage_path, active, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((row) => ({ id: row.id, storagePath: row.storage_path, active: row.active, createdAt: row.created_at }));
}

/** 写真を1枚追加する(JPEG に変換済みのもの)。 */
export async function uploadPhoto(familyId: string, jpeg: Blob): Promise<Photo> {
  const id = crypto.randomUUID();
  const path = photoPath(familyId, id);
  const bucket = db().storage.from(PHOTO_BUCKET);
  const { error: uploadError } = await bucket.upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await db()
    .from("oya_photos")
    .insert({ id, family_id: familyId, storage_path: path })
    .select("id, storage_path, active, created_at")
    .single();
  if (error) {
    // 行が無いファイルは抽選に使われないが、残さない(失敗しても、元のエラーを伝える)。
    await bucket.remove([path]).catch(() => undefined);
    throw error;
  }
  return { id: data.id, storagePath: data.storage_path, active: data.active, createdAt: data.created_at };
}

/** 写真を表示に使う / 使わない(無効化)。 */
export async function setPhotoActive(photoId: string, active: boolean): Promise<void> {
  const { data, error } = await db().from("oya_photos").update({ active }).eq("id", photoId).select("id");
  if (error) throw error;
  if (data.length === 0) throw new PhotoNotFoundError();
}

/** 写真を削除する。すでにこの写真を見た親も、見返せなくなる(その日の写真は「無し」になり、再抽選しない)。 */
export async function deletePhoto(photo: Pick<Photo, "id" | "storagePath">): Promise<void> {
  const { data, error } = await db().from("oya_photos").delete().eq("id", photo.id).select("id");
  if (error) throw error;
  if (data.length === 0) throw new PhotoNotFoundError();
  // 行を消した後なので、ファイルが残っても抽選・見返し・管理画面には出ない。ファイルの削除に失敗しても、
  // 写真は削除済みとして扱う(エラーにすると、消えた写真をもう一度消そうとさせてしまう)。
  await db().storage.from(PHOTO_BUCKET).remove([photo.storagePath]).catch(() => undefined);
}
