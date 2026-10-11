"use client";

import { BottomNav as BottomNavView } from "@note/core/components/BottomNav";
import { useHasDraft } from "@/lib/draft";
import { requestRecordFlowReset } from "@/lib/recordFlowReset";

const items = [
  { href: "/", label: "記録する", icon: "🌙" },
  { href: "/timeline", label: "これまで", icon: "📅" },
  { href: "/stats", label: "傾向", icon: "📊" },
  { href: "/rules", label: "試したこと", icon: "💡" },
  { href: "/group", label: "共有", icon: "👨‍👩‍👧" },
] as const;

// 表示は core の BottomNav。メニューの項目と、入力途中の記録・記録フローのリセットはアプリ側のものを渡す。
export function BottomNav() {
  const hasDraft = useHasDraft();
  return <BottomNavView items={items} hasDraft={hasDraft} onHomeReselect={requestRecordFlowReset} />;
}
