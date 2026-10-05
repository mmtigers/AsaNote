import { describe, expect, it } from "vitest";
import { urlBase64ToUint8Array } from "./push";

describe("urlBase64ToUint8Array", () => {
  it("URL-safe base64(パディングなし)をバイト列に変換する", () => {
    // "hello?>" のbase64は "aGVsbG8/Pg=="。URL-safeでは "/" が "_"、末尾の "=" は省かれる。
    const bytes = urlBase64ToUint8Array("aGVsbG8_Pg");
    expect(Array.from(bytes)).toEqual(Array.from(new TextEncoder().encode("hello?>")));
  });
});
