"use client";

// 同期(push/pull)が連続して失敗しているときだけ、画面下部に軽く知らせる。
// オフラインファーストが売りのアプリなので、同期の信頼性が見えることを優先する。
//
// 表示だけを持つ。失敗中かどうか・閉じたときの処理は、アプリごとの同期状態(syncStatus)から渡す。
export function SyncFailureNotice({ failing, onDismiss }: { failing: boolean; onDismiss: () => void }) {
  if (!failing) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-1/2 z-30 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center justify-between gap-3 rounded-2xl bg-[var(--ink)] px-4 py-2 text-[13px] font-medium text-[var(--bg)] shadow-lg print:hidden"
    >
      <span>⚠️ 同期がうまくいっていません。電波の良い場所で確認してください。</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 whitespace-nowrap underline underline-offset-2 focus:ring-2 focus:ring-[var(--accent)]"
      >
        閉じる
      </button>
    </div>
  );
}
