"use client";

import { BottomNav } from "@note/core/components/BottomNav";

// 下のタブ(SPEC §6.3)。表示は core の BottomNav。さくひんノートには「入力途中の記録」が無いので、印は出さない。
const items = [
  { href: "/", label: "美術館", icon: "🖼️" },
  { href: "/collect", label: "収蔵する", icon: "📷" },
  { href: "/featured", label: "常設展", icon: "⭐" },
  { href: "/group", label: "共有", icon: "👨‍👩‍👧" },
] as const;

function noop() {}

export function AppBottomNav() {
  return <BottomNav items={items} hasDraft={false} onHomeReselect={noop} />;
}
