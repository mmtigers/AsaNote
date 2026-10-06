"use client";

import { useEffect, useRef, useState } from "react";
import { PHOTO_MAX_PER_RECORD } from "@/constants/choices";
import { describeErrorForUser } from "@/lib/errors";
import type { LocalPhoto } from "@/lib/db/localDb";
import { addPhoto, getPhotoUrl, PhotoLimitError, removePhoto, useRecordPhotos } from "@/lib/db/photos";

function PhotoThumb({ photo, onRemove }: { photo: LocalPhoto; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let revoke: string | null = null;
    getPhotoUrl(photo)
      .then((result) => {
        if (!result) return;
        if (!active) {
          if (result.revoke) URL.revokeObjectURL(result.url);
          return;
        }
        if (result.revoke) revoke = result.url;
        setUrl(result.url);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [photo]);

  return (
    <div className="relative aspect-square overflow-hidden rounded-xl bg-[var(--surface-2)]">
      {/* eslint-disable-next-line @next/next/no-img-element -- blob: / 署名付きURLの写真で、next/image の最適化対象ではない */}
      {url && <img src={url} alt="添付した写真" className="h-full w-full object-cover" />}
      <button
        type="button"
        onClick={onRemove}
        aria-label="写真を削除"
        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-sm leading-none text-white"
      >
        ×
      </button>
    </div>
  );
}

// メモ欄に添付する写真の一覧と追加ボタン。追加した時点で縮小して端末に保存する
// (記録の保存を待たない)。上限は 1 日 PHOTO_MAX_PER_RECORD 枚。
export function PhotoStrip({ recordId }: { recordId: string }) {
  const photos = useRecordPhotos(recordId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const count = photos?.length ?? 0;

  async function onPick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        await addPhoto(recordId, file);
      }
    } catch (e) {
      setError(e instanceof PhotoLimitError ? e.message : describeErrorForUser(e, "写真を追加できませんでした"));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      {count > 0 && (
        <div className="mb-2 grid grid-cols-3 gap-2">
          {photos?.map((p) => (
            <PhotoThumb key={p.id} photo={p} onRemove={() => void removePhoto(p.id)} />
          ))}
        </div>
      )}
      {count < PHOTO_MAX_PER_RECORD && (
        <label className="block cursor-pointer rounded-2xl border border-dashed border-[var(--accent)] py-3 text-center text-sm font-bold text-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]">
          {busy ? "処理しています…" : "📷 写真を追加(カメラ / アルバム)"}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            disabled={busy}
            onChange={(e) => void onPick(e.target.files)}
          />
        </label>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <p className="mt-2 text-xs text-[var(--sub)]">
        1日{PHOTO_MAX_PER_RECORD}枚まで。保存時に自動で縮小します。圏外でも端末に保存され、通信できると同期します。
      </p>
    </div>
  );
}
