import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@note/core/auth";
import { ServiceWorkerRegister } from "@note/core/components/ServiceWorkerRegister";
import { MembershipProvider } from "@/lib/membership";
import "./globals.css";

export const metadata: Metadata = {
  title: "おやノート",
  description: "離れて暮らす両親が毎日の様子を記録し、家族が見守るためのアプリ。",
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
    statusBarStyle: "default",
    title: "おやノート",
  },
};

// 高齢の利用者が文字を拡大できるよう、あさノート・よるノートと違ってピンチ拡大を禁止しない。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbf6ee",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[var(--bg)] text-[var(--ink)]">
        <ServiceWorkerRegister />
        <AuthProvider>
          <MembershipProvider>
            <div className="flex-1">{children}</div>
          </MembershipProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
