"use client";

import { useHasTodayRecord } from "@/lib/db/queries";
import { dismissReminderForToday, useDismissedDate } from "@/lib/db/reminderDismissal";
import { toDateInputValue } from "@note/core/date";

// 20時以降にアプリを開いた時点で、その日の記録がまだなら知らせる。
// アプリを閉じていても届く通知はPush(send-evening-reminders)が担うので、これはアプリ内だけの補助。
export const REMINDER_HOUR = 20;

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
  childId: string | null;
  onStartRecording: () => void;
}

// ホーム画面のカレンダー下に埋め込むインラインの通知。固定表示のトースト類とは違い、
// 記録ボタンやヘッダーと重ならないよう、通常のブロックとして流し込む。
export function RecordReminderNotice({ childId, onStartRecording }: RecordReminderNoticeProps) {
  const now = new Date();
  const today = toDateInputValue(now);
  const hasTodayRecord = useHasTodayRecord(today, childId);
  const dismissedDate = useDismissedDate();

  if (!shouldShowReminder({ now, hasTodayRecord, dismissedDate, today })) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--accent-soft)] px-4 py-3 text-[13px] font-medium text-[var(--accent)]"
    >
      <span>🔔 今夜の記録がまだのようです</span>
      <div className="flex flex-none items-center gap-3">
        <button type="button" onClick={onStartRecording} className="underline underline-offset-2">
          記録する
        </button>
        <button type="button" onClick={() => dismissReminderForToday(today)} className="underline underline-offset-2">
          閉じる
        </button>
      </div>
    </div>
  );
}
