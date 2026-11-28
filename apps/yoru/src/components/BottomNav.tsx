"use client";

import { BottomNav as BottomNavView } from "@note/core/components/BottomNav";
import { useHasDraft } from "@/lib/draft";
import { requestRecordFlowReset } from "@/lib/recordFlowReset";

// 「記録する」(`/`)は真ん中(3番目)。core の BottomNav が丸いボタンにする。
const items = [
  { href: "/timeline", label: "これまで", icon: "📅" },
  { href: "/stats", label: "傾向", icon: "📊" },
  { href: "/", label: "記録する", icon: "🌙" },
  { href: "/rules", label: "試したこと", icon: "💡" },
  { href: "/group", label: "共有", icon: "👨‍👩‍👧" },
] as const;

// 表示は core の BottomNav。メニューの項目と、入力途中の記録・記録フローのリセットはアプリ側のものを渡す。
export function BottomNav() {
  const hasDraft = useHasDraft();
  return <BottomNavView items={items} hasDraft={hasDraft} onHomeReselect={requestRecordFlowReset} />;
}
