"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useGroupMembers } from "@note/core/db/groups";
import { useHasTodayPartnerRecord } from "@/lib/db/queries";
import { toDateInputValue } from "@note/core/date";

interface PartnerRecordStatusProps {
  childId: string | null;
}

// 記録ページの先頭で、パートナーが当日の記録を済ませているかを可視化する(#3-5)。
// 未記録を知らせる通知は#6のリマインダー(RecordReminderNotice)が別途担っているため、
// ここでは「パートナーが済ませている」の一言だけに絞り、パートナー不在・未記録のときは何も出さない。
export function PartnerRecordStatus({ childId }: PartnerRecordStatusProps) {
  const { session } = useAuth();
  const members = useGroupMembers();
  const hasPartner = (members?.length ?? 0) > 1;
  const today = toDateInputValue(new Date());
  const hasPartnerRecord = useHasTodayPartnerRecord(today, session?.user.id ?? null, childId);

  if (!hasPartner || !hasPartnerRecord) return null;

  return (
    <div
      role="status"
      className="mb-3 flex items-center gap-1.5 self-start rounded-full bg-[var(--calm-soft)] px-3.5 py-1.5 text-[12px] font-semibold text-[var(--calm)]"
    >
      <span>💐</span>
      <span>パートナーが今日の記録を済ませています</span>
    </div>
  );
}
