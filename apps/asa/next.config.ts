import type { NextConfig } from "next";
import { buildContentSecurityPolicy } from "@note/core/csp";

// Issue #62: 認証 Cookie を扱うアプリとして最低限のセキュリティヘッダを付与する。
// CSP(#197): よるノートと同じ方針(packages/core/src/csp.ts。nonce なしの静的な方式)を使う。
// ただし最初は **Report-Only**(違反を報告するだけで、ブロックはしない)にしてある。許可の漏れで本番が
// 壊れないようにするため。違反はブラウザの開発者ツールのコンソール(「Content-Security-Policy-Report-Only」
// の警告)に出る。通常の操作で違反が出ないことを確かめてから、キーを "Content-Security-Policy" に変えて強制する。
const securityHeaders = [
  {
    key: "Content-Security-Policy-Report-Only",
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
