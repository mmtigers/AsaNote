import type { NextConfig } from "next";
import { buildContentSecurityPolicy } from "@note/core/csp";

// Issue #62: 認証 Cookie を扱うアプリとして最低限のセキュリティヘッダを付与する。
// CSP(#197): よるノートと同じ方針(packages/core/src/csp.ts。nonce なしの静的な方式)を使い、
// 違反をブロックする(強制)。Report-Only で配って、実運用の通常の操作で違反が出ないことを
// 確かめてから切り替えた。許可の漏れでブロックが起きたら、ブラウザの開発者ツールのコンソールに
// 「Content-Security-Policy」の違反が出る。
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
