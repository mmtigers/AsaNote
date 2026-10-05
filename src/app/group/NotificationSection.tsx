"use client";

import type { NotificationSettingsAdmin } from "./useNotificationSettings";

// 「通知」セクションの表示専用コンポーネント。状態と操作は useNotificationSettings が持つ。
export function NotificationSection({ admin }: { admin: NotificationSettingsAdmin }) {
  if (!admin.supported) {
    return (
      <section className="flex flex-col gap-2 rounded-2xl bg-[var(--surface-2)] p-4">
        <h2 className="text-sm font-semibold text-[var(--sub)]">通知</h2>
        <p className="text-xs text-[var(--sub)]">お使いのブラウザはプッシュ通知に対応していません。</p>
      </section>
    );
  }

  const disabled = admin.loading || admin.saving;
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-[var(--surface-2)] p-4">
      <h2 className="text-sm font-semibold text-[var(--sub)]">通知</h2>
      <p className="text-xs text-[var(--sub)]">
        指定した時刻に、今夜まだ記録が無ければお知らせします(家族のどなたかが記録済みなら届きません)。
        iPhoneではホーム画面に追加したアプリから設定してください。
      </p>

      <label className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface)] px-4 py-3 text-sm">
        <span>夜のリマインド通知</span>
        <input
          type="checkbox"
          role="switch"
          checked={admin.enabled}
          disabled={disabled}
          onChange={(event) => void admin.setEnabled(event.target.checked)}
          className="h-5 w-5 accent-[var(--accent)]"
        />
      </label>

      <div className="flex items-center gap-3 rounded-xl bg-[var(--surface)] px-4 py-3 text-sm">
        <label htmlFor="reminder-time" className="flex-1">
          通知時刻
        </label>
        <input
          id="reminder-time"
          type="time"
          value={admin.reminderTime}
          disabled={disabled}
          onChange={(event) => void admin.setReminderTime(event.target.value)}
          className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1.5 text-base font-medium tabular-nums outline-none"
        />
      </div>
    </section>
  );
}
