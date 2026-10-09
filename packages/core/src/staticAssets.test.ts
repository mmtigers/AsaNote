import { describe, expect, it } from "vitest";
import { collectStaticAssetPaths } from "./staticAssets";

const ORIGIN = "https://example.com";

describe("collectStaticAssetPaths", () => {
  it("同じオリジンの /_next/static/ のパスだけを取り出す", () => {
    const paths = collectStaticAssetPaths(
      [
        { name: `${ORIGIN}/_next/static/chunks/a.js` },
        { name: `${ORIGIN}/_next/static/css/b.css?v=1` },
        { name: `${ORIGIN}/icons/icon-192.png` },
        { name: `${ORIGIN}/api/data` },
        { name: "https://other.example.com/_next/static/chunks/c.js" },
        { name: "not a url" },
      ],
      ORIGIN
    );

    expect(paths).toEqual(["/_next/static/chunks/a.js", "/_next/static/css/b.css"]);
  });

  it("重複は1つにまとめる", () => {
    const paths = collectStaticAssetPaths(
      [{ name: `${ORIGIN}/_next/static/a.js` }, { name: `${ORIGIN}/_next/static/a.js` }],
      ORIGIN
    );

    expect(paths).toEqual(["/_next/static/a.js"]);
  });

  it("上限(200件)を超えては取り出さない", () => {
    const entries = Array.from({ length: 300 }, (_, i) => ({ name: `${ORIGIN}/_next/static/${i}.js` }));

    expect(collectStaticAssetPaths(entries, ORIGIN)).toHaveLength(200);
  });
});
