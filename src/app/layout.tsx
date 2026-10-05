import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { BottomNav } from "@/components/BottomNav";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "よるノート",
  description: "帰宅から就寝までの夜のようすを、寝る前にサッと記録する家族向けメモアプリ。",
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
    title: "よるノート",
  },
};

// ホーム画面から起動したPWAとして片手で使う前提で、ピンチ拡大は禁止する(あさノートと同じ判断)。
// 見直すときは userScalable と maximumScale をセットで外すこと。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#f4f3fb",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[var(--bg)] text-[var(--ink)]">
        <ServiceWorkerRegister />
        <AuthProvider>
          <div className="flex-1 pb-20">{children}</div>
          <BottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
