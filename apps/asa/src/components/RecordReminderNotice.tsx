"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useHasTodayOwnRecord } from "@/lib/db/queries";
import { dismissReminderForToday, useDismissedDate } from "@/lib/db/reminderDismissal";
import { toDateInputValue } from "@note/core/date";

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

interface RecordReminderNoticeProps {
  onStartRecording: () => void;
}

// ホーム画面のカレンダー下に埋め込むインラインの通知(#6)。固定表示のトースト類とは
// 違い、記録ボタンや画面上部のヘッダーと重ならないよう、通常のブロックとして流し込む。
export function RecordReminderNotice({ onStartRecording }: RecordReminderNoticeProps) {
  const { session } = useAuth();
  const now = new Date();
  const today = toDateInputValue(now);
  const hasTodayRecord = useHasTodayOwnRecord(today, session?.user.id ?? null);
  const dismissedDate = useDismissedDate();

  if (!shouldShowReminder({ now, hasTodayRecord, dismissedDate, today })) return null;

  return (
    <div
      role="status"
      className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-[var(--accent-soft)] px-4 py-3 text-[13px] font-medium text-[var(--accent)]"
    >
      <span>🔔 あなたの今日の記録がまだのようです</span>
      <div className="flex flex-none items-center gap-3">
        <button type="button" onClick={onStartRecording} className="underline underline-offset-2">
          記録する
        </button>
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
