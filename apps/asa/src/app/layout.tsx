import type { Metadata, Viewport } from "next";
import { ClientErrorReporter } from "@note/core/components/ClientErrorReporter";
import { releases } from "@/data/releases";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { BottomNav } from "@/components/BottomNav";
import { SyncFailureNotice } from "@/components/SyncFailureNotice";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "あさノート",
  description: "登校前後のようすを、選ぶだけでサッと記録する家族向けメモアプリ。",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "あさノート",
  },
};

// ピンチ拡大を禁止している(#62)。アクセシビリティ(WCAG 1.4.4)の観点では
// 拡大を妨げない方が望ましいが、ホーム画面から起動した PWA でネイティブアプリに
// 近い操作感を保つことを優先し、**意図的に残す**判断をした(2026-09-18)。
// 入力欄タップ時の自動ズームやダブルタップ拡大が起きないことが、朝の慌ただしい
// 時間に片手で操作するこのアプリの使い勝手に効いている。
//
// 見直すなら、まず本文のコントラストと文字サイズ(既定で拡大しなくても読めるか)を
// 確認したうえで、userScalable と maximumScale をセットで外すこと。片方だけ変えても
// iOS Safari は userScalable=false を無視することがあり、挙動が中途半端になる。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#fff5f6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[var(--bg)] text-[var(--ink)]">
        <ServiceWorkerRegister />
        <ClientErrorReporter app="asa" appVersion={releases[0]?.version} />
        <AuthProvider>
          <div className="flex-1 pb-20">{children}</div>
          <SyncFailureNotice />
          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
