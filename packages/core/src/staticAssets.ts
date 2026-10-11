// 初回訪問の直後にオフラインで起動できるようにするため、ページが読み込んだ JS/CSS の URL を
// Service Worker に渡して、キャッシュさせる(#133)。
//
// 最初の読み込みは、Service Worker が制御を始める前に行われることがある。その分は、
// Service Worker の fetch ハンドラを通らないので、ブラウザの HTTP キャッシュが消えると
// オフラインで取れず、画面が崩れる。
export const CACHE_STATIC_URLS_MESSAGE = "CACHE_STATIC_URLS";

const STATIC_PREFIX = "/_next/static/";
// 異常に多いときに、キャッシュを膨らませないための上限。
const MAX_URLS = 200;

/** Performance API の resource エントリから、同じオリジンの `/_next/static/` のパスだけを重複なく取り出す。 */
export function collectStaticAssetPaths(entries: { name: string }[], origin: string): string[] {
  const paths = new Set<string>();
  for (const entry of entries) {
    let url: URL;
    try {
      url = new URL(entry.name);
    } catch {
      continue;
    }
    if (url.origin !== origin || !url.pathname.startsWith(STATIC_PREFIX)) continue;
    paths.add(url.pathname);
    if (paths.size >= MAX_URLS) break;
  }
  return [...paths];
}
