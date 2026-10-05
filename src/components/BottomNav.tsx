"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "記録する", icon: "🌙" },
  { href: "/timeline", label: "これまで", icon: "📅" },
  { href: "/stats", label: "傾向", icon: "📊" },
  { href: "/group", label: "共有", icon: "👨‍👩‍👧" },
] as const;

// 片手操作前提のため画面下部に固定。iOSのホームインジケーター分もセーフエリアで確保する。
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur-sm [padding-bottom:env(safe-area-inset-bottom)] print:hidden">
      <ul className="mx-auto flex max-w-md gap-1 px-2 py-1.5">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[11px] focus:ring-2 focus:ring-[var(--accent)] ${
                  active ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent)]" : "text-[var(--sub)]"
                }`}
              >
                <span className="text-lg leading-none">{item.icon}</span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
