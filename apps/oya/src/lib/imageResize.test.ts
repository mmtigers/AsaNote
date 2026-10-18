import { describe, expect, it } from "vitest";
import { fitWithin, ImageResizeError, MAX_EDGE, MAX_INPUT_BYTES, resizeToJpeg } from "./imageResize";

describe("fitWithin", () => {
  it("長い辺を上限に収め、縦横比を保つ", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: MAX_EDGE, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: MAX_EDGE });
  });

  it("小さい写真は拡大しない", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("極端に細長くても0pxにならない", () => {
    expect(fitWithin(100000, 10)).toEqual({ width: MAX_EDGE, height: 1 });
  });
});

describe("resizeToJpeg", () => {
  it("大きすぎるファイルは読み込む前に断る", async () => {
    const huge = { size: MAX_INPUT_BYTES + 1 } as Blob;
    await expect(resizeToJpeg(huge)).rejects.toEqual(new ImageResizeError("too-large"));
  });

  it("画像として読めなければ unreadable", async () => {
    // jsdom には createImageBitmap が無い(= 読み込めない端末と同じ扱いになる)。
    await expect(resizeToJpeg(new Blob(["not an image"]))).rejects.toMatchObject({ reason: "unreadable" });
  });
});
