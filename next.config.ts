import type { NextConfig } from "next";

// Issue #62: 認証 Cookie を扱うアプリとして最低限のセキュリティヘッダを付与する。
// CSP は Next.js のインライン script 等との調整が必要なため、ここでは付けない。
const securityHeaders = [
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
