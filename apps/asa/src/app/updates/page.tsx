"use client";

import { UpdatesView } from "@note/core/components/UpdatesView";
import { releases } from "@/data/releases";
import { markVersionSeen } from "@/lib/releaseSeen";

// 画面は @note/core。更新履歴と「見た」記録は、このアプリのものを渡す。
export default function UpdatesPage() {
  return <UpdatesView releases={releases} markVersionSeen={markVersionSeen} />;
}
