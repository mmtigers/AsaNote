"use client";

import { useEffect } from "react";

interface ConfirmDialogProps {
  open: boolean;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// window.confirm()の代替。ネイティブダイアログはアプリのUIから浮いて見えスタイル制御も
// できないため、カスタムモーダルに統一する。
export function ConfirmDialog({
  open,
  message,
  confirmLabel = "削除する",
  cancelLabel = "キャンセル",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Escapeで閉じる。キーボード・外付けキーボードの利用者が、ダイアログから抜けられなくならないように。
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={message}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={onCancel}
    >
      <div
        className="mx-4 mb-24 w-full max-w-sm rounded-2xl bg-[var(--surface)] p-5 sm:mb-0"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-sm text-[var(--ink)]">{message}</p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="flex-1 rounded-full bg-[var(--surface-2)] py-3 text-sm font-semibold text-[var(--ink)] focus:ring-2 focus:ring-[var(--accent)]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-full bg-red-500 py-3 text-sm font-semibold text-white focus:ring-2 focus:ring-[var(--accent)]"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
