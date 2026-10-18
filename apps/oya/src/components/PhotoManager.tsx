"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { ConfirmDialog } from "@note/core/components/ConfirmDialog";
import { deletePhoto, fetchFamilyPhotos, setPhotoActive, uploadPhoto, type Photo } from "@/lib/db/photos";
import { describeServerError } from "@/lib/errors";
import { ImageResizeError, resizeToJpeg } from "@/lib/imageResize";
import { getPhotoUrls } from "@/lib/photos";

type Message = { kind: "info" | "error"; text: string } | null;

/**
 * 孫の写真の管理(家族管理者だけ。SPEC §5)。写真の追加(端末で小さくしてから送る)・表示に使う/使わない・削除。
 * ボタンの出し分けは表示のためだけで、権限の検証はサーバー(oya_photos と Storage の RLS)が行う。
 */
export function PhotoManager({ familyId }: { familyId: string }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [pendingDelete, setPendingDelete] = useState<Photo | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const list = await fetchFamilyPhotos();
    setPhotos(list);
    // 一覧の画像が読めなくても、管理の操作はできる(画像の代わりに案内を出す)。
    setUrls(await getPhotoUrls(list.map((p) => p.storagePath)).catch(() => new Map<string, string>()));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- サーバー(外部)のデータを開いた時に読み込む
    reload().catch((error) => setMessage({ kind: "error", text: describeServerError(error, "写真を読み込めませんでした。") }));
  }, [reload]);

  async function onFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // 同じファイルをもう一度選んでも change が起きるよう、選択を空にしておく。
    event.target.value = "";
    if (files.length === 0) return;
    setBusy(true);
    setMessage(null);
    let added = 0;
    let lastError: unknown = null;
    for (const [index, file] of files.entries()) {
      setProgress(files.length > 1 ? `${files.length}枚のうち${index + 1}枚目を追加しています...` : "写真を追加しています...");
      try {
        await uploadPhoto(familyId, await resizeToJpeg(file));
        added += 1;
      } catch (error) {
        lastError = error;
      }
    }
    setProgress(null);
    await reload().catch(() => undefined);
    setBusy(false);
    if (lastError === null) {
      setMessage({ kind: "info", text: `${added}枚の写真を追加しました。` });
      return;
    }
    const reason = describeUploadError(lastError);
    setMessage({
      kind: "error",
      text: added > 0 ? `${files.length}枚のうち${files.length - added}枚を追加できませんでした。${reason}` : `写真を追加できませんでした。${reason}`,
    });
  }

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await reload();
    } catch (error) {
      setMessage({ kind: "error", text: describeServerError(error, fallback) });
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    await run(() => deletePhoto(target), "写真を削除できませんでした。もう一度お試しください。");
  }

  const activeCount = photos?.filter((p) => p.active).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-2xl bg-[var(--surface)] p-4">
        <p className="text-base leading-relaxed">
          父・母が記録を完了すると、ここにある写真から1枚が選ばれて表示されます。写真は、この端末で小さくしてから送ります。
        </p>
        <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => void onFilesSelected(event)} />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className="min-h-12 rounded-full bg-[var(--accent)] py-4 text-lg font-bold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-60"
        >
          {progress ? "追加しています..." : "写真を追加する"}
        </button>
        {progress && (
          <p role="status" className="text-base">
            {progress}
          </p>
        )}
      </section>

      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`text-base ${message.kind === "error" ? "text-[var(--holiday)]" : ""}`}>
          {message.text}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">登録した写真</h2>
        {photos === null ? (
          <p className="text-base text-[var(--sub)]">読み込み中...</p>
        ) : photos.length === 0 ? (
          <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-base leading-relaxed">
            まだ写真がありません。写真が無いあいだも、父・母は記録を完了できます。
          </p>
        ) : (
          <>
            <p className="text-base text-[var(--sub)]">
              {photos.length}枚(表示に使う写真: {activeCount}枚)。「使わない」にした写真は、これからの表示に出ません。すでに見た父・母は、見返せます。
            </p>
            <ul className="grid grid-cols-2 gap-3">
              {photos.map((photo) => {
                const url = urls.get(photo.storagePath);
                return (
                  <li key={photo.id} className="flex flex-col gap-2 rounded-2xl bg-[var(--surface)] p-2">
                    <div className={`aspect-square overflow-hidden rounded-xl bg-[var(--surface-2)] ${photo.active ? "" : "opacity-50"}`}>
                      {url ? (
                        // 署名付きURL(Supabase の別オリジン)なので、next/image の最適化は使わない。
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="孫の写真" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <p className="flex h-full items-center justify-center p-2 text-center text-sm text-[var(--sub)]">画像を読み込めません</p>
                      )}
                    </div>
                    <p className="text-center text-base font-bold">{photo.active ? "表示に使う" : "使わない"}</p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() => setPhotoActive(photo.id, !photo.active), "写真の設定を変えられませんでした。もう一度お試しください。")
                      }
                      className="min-h-12 rounded-full bg-[var(--surface-2)] px-2 text-base font-bold text-[var(--ink)] disabled:opacity-60"
                    >
                      {photo.active ? "使わないにする" : "また使う"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPendingDelete(photo)}
                      className="min-h-12 text-base text-[var(--holiday)] underline underline-offset-2 disabled:opacity-60"
                    >
                      削除する
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <ConfirmDialog
        open={pendingDelete !== null}
        message="この写真を削除しますか?すでにこの写真を見た父・母も、見返せなくなります。元に戻せません。表示に使わないだけなら「使わないにする」を選んでください。"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function describeUploadError(error: unknown): string {
  if (error instanceof ImageResizeError) {
    return error.reason === "too-large"
      ? "ファイルが大きすぎます(40MBまで)。"
      : "画像として読み込めないファイルがありました。写真(JPEG・PNG など)を選んでください。";
  }
  return describeServerError(error, "電波の良いところで、もう一度お試しください。");
}
