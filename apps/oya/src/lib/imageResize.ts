// 孫の写真を、アップロードの前に端末で小さくする(SPEC §5)。スマートフォンの写真(数MB・4000px 級)を
// そのまま置くと、親の端末での表示が遅く、Storage の容量も使うため。
//   - 長い辺を MAX_EDGE に収め、JPEG(品質 JPEG_QUALITY)にする。小さい写真は拡大しない。
//   - 向き(EXIF の回転)は、ブラウザが読み込むときに反映する(createImageBitmap の imageOrientation)。
//   - JPEG にし直すため、位置情報などの撮影情報(EXIF)は付かない。

export const MAX_EDGE = 1600;
export const JPEG_QUALITY = 0.85;
/** これより大きいファイルは、読み込む前に断る(端末のメモリを使い切らないように)。 */
export const MAX_INPUT_BYTES = 40 * 1024 * 1024;

export class ImageResizeError extends Error {
  constructor(readonly reason: "too-large" | "unreadable") {
    super(reason);
    this.name = "ImageResizeError";
  }
}

/** 縦横比を保って、長い辺が maxEdge 以下になる大きさ(整数)。 */
export function fitWithin(width: number, height: number, maxEdge: number = MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** 画像ファイルを、アップロード用の JPEG にする。 */
export async function resizeToJpeg(file: Blob): Promise<Blob> {
  if (file.size > MAX_INPUT_BYTES) throw new ImageResizeError("too-large");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageResizeError("unreadable");
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new ImageResizeError("unreadable");
    // 透過のある画像(PNG)は、JPEG で黒くならないよう白を敷く。
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) throw new ImageResizeError("unreadable");
    return blob;
  } finally {
    bitmap.close();
  }
}
