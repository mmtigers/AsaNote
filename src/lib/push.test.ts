// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { urlBase64ToUint8Array } from "./push";

describe("urlBase64ToUint8Array", () => {
  it("URL-safe base64をデコードする(パディング無しでも)", () => {
    // "hello"のURL-safe base64表現(パディング無し)。
    const result = urlBase64ToUint8Array("aGVsbG8");
    expect(Array.from(result)).toEqual([104, 101, 108, 108, 111]); // "hello"の各文字コード
  });

  it("-と_を通常のbase64文字へ戻してからデコードする", () => {
    // 標準base64で+/を含む値をURL-safe化した文字列("\xfb\xff\xbf" 相当)。
    const result = urlBase64ToUint8Array("-_-_");
    expect(Array.from(result)).toEqual(Array.from(Uint8Array.from(atob("+/+/"), (c) => c.charCodeAt(0))));
  });
});
