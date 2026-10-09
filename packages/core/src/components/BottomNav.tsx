"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface BottomNavItem {
  href: string;
  label: string;
  icon: string;
}

// 入力途中の記録があることを示す小さなドット。件数に意味はないので数字は出さない。
function DraftBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface)] bg-[var(--accent)]" />
  );
}

// 片手操作前提のため画面下部に固定。iOSのホームインジケーター分もセーフエリアで確保する。
//
// 表示だけを持つ。メニューの項目・入力途中の記録の有無・ホームを再度押したときの処理は、アプリ側から渡す
// (`/` を「記録する」のホームとして扱う)。
export function BottomNav({
  items,
  hasDraft,
  onHomeReselect,
}: {
  items: readonly BottomNavItem[];
  hasDraft: boolean;
  /** 既にホーム(`/`)にいる状態で、ホームのタブを押したときに呼ぶ。 */
  onHomeReselect: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="メインメニュー" className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur-sm [padding-bottom:env(safe-area-inset-bottom)] print:hidden">
      <ul className="mx-auto flex max-w-md gap-1 px-2 py-1.5">
        {items.map((item) => {
          const active = pathname === item.href;
          const showDraftBadge = item.href === "/" && hasDraft;
          // 既にホームにいると `/` へのLinkでは画面が作り直されず、入力途中の画面がそのまま残ってしまう。
          // その場合だけ最初の画面へ戻すよう通知する。
          const resetRecordFlow = item.href === "/" && active ? onHomeReselect : undefined;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                onClick={resetRecordFlow}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[11px] focus:ring-2 focus:ring-[var(--accent)] ${
                  active ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent)]" : "text-[var(--sub)]"
                }`}
              >
                <span aria-hidden="true" className="relative text-lg leading-none">
                  {item.icon}
                  <DraftBadge show={showDraftBadge} />
                </span>
                {item.label}
                {showDraftBadge && <span className="sr-only">(入力途中の記録があります)</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
