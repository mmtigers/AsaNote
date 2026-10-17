import type { NextConfig } from "next";
import { buildContentSecurityPolicy } from "@note/core/csp";

// あさノート・よるノートと同じセキュリティヘッダ。CSP は静的なまま使える方式(nonce なし)で、
// 理由と許可の内容は packages/core/src/csp.ts(3アプリで共用)を参照。
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
