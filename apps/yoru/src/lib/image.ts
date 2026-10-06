// 写真を保存前に縮小・JPEG圧縮する。スマホで撮った写真は数MBあり、そのまま保存・同期すると
// 端末の容量と通信量を圧迫するため、長辺 MAX_EDGE px・JPEG品質 QUALITY にそろえる。
export const MAX_EDGE = 1600;
export const QUALITY = 0.8;

/** 長辺が maxEdge に収まるよう縦横比を保って縮小したサイズ。小さい画像は拡大しない。 */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function compressImage(file: Blob): Promise<Blob> {
  // createImageBitmap は EXIF の向きを反映するオプションを持つ(スマホの縦撮りが横倒しにならない)。
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("画像を処理できませんでした");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob) throw new Error("画像を処理できませんでした");
    return blob;
  } finally {
    bitmap.close();
  }
}
