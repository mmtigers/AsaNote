"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHasDraft } from "@/lib/draft";
import { requestRecordFlowReset } from "@/lib/recordFlowReset";

const items = [
  { href: "/", label: "記録する", icon: "📝" },
  { href: "/timeline", label: "これまで", icon: "📅" },
  { href: "/stats", label: "傾向", icon: "📊" },
  { href: "/group", label: "共有", icon: "👨‍👩‍👧" },
] as const;

// 入力途中の記録があることを示す小さなドット。件数に意味はないので数字は出さない。
function DraftBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface)] bg-[var(--accent)]" />
  );
}

// 片手操作前提のため画面下部に固定。iOSのホームインジケーター分もセーフエリアで確保する。
export function BottomNav() {
  const pathname = usePathname();
  const hasDraft = useHasDraft();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur-sm [padding-bottom:env(safe-area-inset-bottom)] print:hidden">
      <ul className="mx-auto flex max-w-md gap-1 px-2 py-1.5">
        {items.map((item) => {
          const active = pathname === item.href;
          const showDraftBadge = item.href === "/" && hasDraft;
          // 既にホームにいると `/` へのLinkでは画面が作り直されず、記録フローの途中の
          // ステップがそのまま残ってしまう。その場合だけ最初の画面へ戻すよう通知する。
          const resetRecordFlow = item.href === "/" && active ? requestRecordFlowReset : undefined;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                onClick={resetRecordFlow}
                className={`flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[11px] focus:ring-2 focus:ring-[var(--accent)] ${
                  active ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent)]" : "text-[var(--sub)]"
                }`}
              >
                <span className="relative text-lg leading-none">
                  {item.icon}
                  <DraftBadge show={showDraftBadge} />
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
