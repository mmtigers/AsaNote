// Content-Security-Policy。next.config.ts から使う(ビルド時に1回だけ組み立てる静的なヘッダ)。
//
// nonce 方式にしない理由: nonce は毎回のリクエストで作るため、全ページを動的レンダリングにする必要がある。
// このアプリはオフラインでも開ける静的なPWA(Service Worker が HTML をキャッシュする)なので、
// 静的なまま使える方式にしている。その代わり script-src に 'unsafe-inline' が要る
// (Next.js が水和用のデータをインラインscriptで埋め込むため)。
// それでも次は守れる: 接続先・画像の読み込み先の限定(情報の持ち出しを防ぐ)、他サイトの
// スクリプトの読み込み禁止、<base> / form / フレーム埋め込みの禁止、<object> の禁止。

export interface CspOptions {
  // NEXT_PUBLIC_SUPABASE_URL。認証・DB・Storage(写真の署名付きURL)の接続先として許可する。
  supabaseUrl?: string;
  // 開発時は React が eval を使うため 'unsafe-eval' が要る(本番では不要)。
  isDev?: boolean;
}

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy({ supabaseUrl, isDev = false }: CspOptions = {}): string {
  const supabase = originOf(supabaseUrl);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // フォントは Google Fonts(globals.css の @import)。CSS は fonts.googleapis.com、実体は fonts.gstatic.com。
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "https://fonts.gstatic.com"],
    // 写真は Storage の署名付きURL(Supabase)と、保存前の縮小画像(blob:)。
    "img-src": ["'self'", "blob:", "data:", ...(supabase ? [supabase] : [])],
    "connect-src": ["'self'", ...(supabase ? [supabase] : [])],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}
