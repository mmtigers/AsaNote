"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useHasTodayOwnRecord } from "@/lib/db/queries";
import { dismissReminderForToday, useDismissedDate } from "@/lib/db/reminderDismissal";
import { toDateInputValue } from "@/lib/date";

// 正午(12時)以降にアプリを開いた時点で、その日の記録がまだなら知らせる(#6)。
// 本格的なPush通知(アプリを閉じていても届く)には別途Supabase側の作業
// (VAPID鍵発行・Edge Function・pg_cron)が要るため、まずはアプリ内のみで実装する。
const REMINDER_HOUR = 12;

export function shouldShowReminder(options: {
  now: Date;
  hasTodayRecord: boolean | undefined;
  dismissedDate: string | null;
  today: string;
}): boolean {
  const { now, hasTodayRecord, dismissedDate, today } = options;
  if (hasTodayRecord === undefined || hasTodayRecord) return false;
  if (dismissedDate === today) return false;
  return now.getHours() >= REMINDER_HOUR;
}

export function RecordReminderNotice() {
  const { session } = useAuth();
  const now = new Date();
  const today = toDateInputValue(now);
  const hasTodayRecord = useHasTodayOwnRecord(today, session?.user.id ?? null);
  const dismissedDate = useDismissedDate();

  if (!shouldShowReminder({ now, hasTodayRecord, dismissedDate, today })) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-3 bg-[var(--accent)] px-4 py-2 text-[13px] font-medium text-[var(--accent-ink)] [padding-top:env(safe-area-inset-top)] print:hidden"
    >
      <span>🔔 今日の記録がまだのようです</span>
      <div className="flex flex-none items-center gap-3">
        <Link href="/" className="underline underline-offset-2">
          記録する
        </Link>
        <button
          type="button"
          onClick={() => dismissReminderForToday(today)}
          className="underline underline-offset-2"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
