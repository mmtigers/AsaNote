"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePendingSyncCount } from "@/lib/db/queries";

const items = [
  { href: "/", label: "記録する", icon: "📝" },
  { href: "/timeline", label: "これまで", icon: "📅" },
  { href: "/stats", label: "傾向", icon: "📊" },
  { href: "/group", label: "共有", icon: "👨‍👩‍👧" },
] as const;

function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold leading-none text-[var(--accent-ink)]">
      {count > 99 ? "99+" : count}
    </span>
  );
}

// 片手操作前提のため画面下部に固定。iOSのホームインジケーター分もセーフエリアで確保する。
export function BottomNav() {
  const pathname = usePathname();
  const pendingCount = usePendingSyncCount();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--bg)]/95 backdrop-blur-sm [padding-bottom:env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-md">
        {items.map((item) => {
          const active = pathname === item.href;
          const badgeCount = item.href === "/" ? (pendingCount ?? 0) : 0;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] focus:ring-2 focus:ring-[var(--accent)] ${
                  active ? "text-[var(--accent)] font-semibold" : "text-[var(--sub)]"
                }`}
              >
                <span className="relative text-lg leading-none">
                  {item.icon}
                  <NavBadge count={badgeCount} />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
