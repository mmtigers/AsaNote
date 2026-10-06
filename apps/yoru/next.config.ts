import type { NextConfig } from "next";
import { buildContentSecurityPolicy } from "./src/lib/csp";

// Issue #62: 認証 Cookie を扱うアプリとして最低限のセキュリティヘッダを付与する。
// CSP は静的なまま使える方式(nonce なし)にしている。理由と許可の内容は src/lib/csp.ts を参照。
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: buildContentSecurityPolicy({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      isDev: process.env.NODE_ENV === "development",
    }),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
