import type { Metadata, Viewport } from "next";
import { ServiceWorkerRegister } from "@note/core/components/ServiceWorkerRegister";
import { AppBottomNav } from "@/components/AppBottomNav";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "さくひんノート",
  description: "子どもが持ち帰った作品を写真で残して、額縁に入れて見返せる、おうちの美術館。",
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
    title: "さくひんノート",
  },
};

// あさノート・よるノートと違って、ピンチ拡大を禁止しない。作品の細部を拡大して見るアプリなので
// (docs/SPEC.md §5.5)、ブラウザの拡大を止めない(おやノートと同じ)。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f2f7f0",
};

// ログインはあさノート・よるノートと同じ Supabase(@note/core/auth)。下のタブは core の BottomNav(SPEC §6.3)。
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[var(--bg)] text-[var(--ink)]">
        <ServiceWorkerRegister />
        <AuthProvider>
          <div className="flex-1 pb-20">{children}</div>
          <AppBottomNav />
        </AuthProvider>
      </body>
    </html>
  );
}
