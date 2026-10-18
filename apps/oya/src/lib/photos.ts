import { db } from "@/lib/supabase";

// 孫の写真の表示用URL。非公開バケットの署名付きURLで、有効期限は短くする(URL を知っていれば期限内は
// 誰でも開けるため。ADR 0001)。読めるかどうかは Storage の RLS が決める(親は、自分に表示された写真だけ)。
export const PHOTO_BUCKET = "grandchild-photos";
export const SIGNED_URL_TTL_SECONDS = 10 * 60;

export async function getPhotoUrl(storagePath: string): Promise<string> {
  const { data, error } = await db().storage.from(PHOTO_BUCKET).createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

/** 複数の写真の表示用URL(一覧のため)。読めなかった写真は含まない。 */
export async function getPhotoUrls(storagePaths: string[]): Promise<Map<string, string>> {
  if (storagePaths.length === 0) return new Map();
  const { data, error } = await db().storage.from(PHOTO_BUCKET).createSignedUrls(storagePaths, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  const urls = new Map<string, string>();
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
  }
  return urls;
}
