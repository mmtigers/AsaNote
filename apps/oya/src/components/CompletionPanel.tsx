"use client";

import { useEffect, useState } from "react";
import type { RevealedPhoto } from "@/lib/db/records";
import { getPhotoUrl } from "@/lib/photos";

/**
 * 記録を完了した後に出す画面。その日の孫の写真を1枚表示する(写真の選択はサーバーが1日1回だけ行う)。
 * 写真が無い日・写真を読み込めないときも、記録は保存・完了済みであることを伝える(記録は失われない)。
 */
export function CompletionPanel({ photo, onClose }: { photo: RevealedPhoto | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!photo) return;
    let cancelled = false;
    getPhotoUrl(photo.storagePath)
      .then((signedUrl) => {
        if (!cancelled) setUrl(signedUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [photo]);

  return (
    <section aria-live="polite" className="flex flex-col gap-4 rounded-2xl bg-[var(--surface)] p-4 text-center">
      <h2 className="text-xl font-bold">記録しました。おつかれさまでした</h2>
      {photo && !failed && (
        <div className="overflow-hidden rounded-2xl bg-[var(--surface-2)]">
          {url ? (
            // 署名付きURL(Supabase の別オリジン)なので、next/image の最適化は使わない。
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="今日の写真" className="h-auto w-full" onError={() => setFailed(true)} />
          ) : (
            <p className="py-16 text-base text-[var(--sub)]">写真を読み込んでいます...</p>
          )}
        </div>
      )}
      {photo && failed && (
        <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-base">
          写真を読み込めませんでした。記録は保存されています。あとで「この日の写真を見る」から、もう一度見られます。
        </p>
      )}
      {!photo && <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-base">今日の写真はありません。記録は保存されています。</p>}
      <button
        type="button"
        onClick={onClose}
        className="min-h-12 rounded-full bg-[var(--surface-2)] py-3 text-lg font-bold text-[var(--ink)] focus:ring-2 focus:ring-[var(--accent)]"
      >
        閉じる
      </button>
    </section>
  );
}
