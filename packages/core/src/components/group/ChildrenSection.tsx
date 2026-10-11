"use client";

import { useAuth } from "../../auth";
import type { ChildrenAdmin } from "../../group/useChildrenAdmin";
import { ConfirmDialog } from "../ConfirmDialog";

// 「お子さま」セクションの表示専用コンポーネント(#62)。
// 状態と操作は useChildrenAdmin が持ち、ここは組み立てだけを行う。
export function ChildrenSection({ admin }: { admin: ChildrenAdmin }) {
  const { session } = useAuth();
  const myUserId = session?.user.id;

  return (
    <>
      <section className="flex flex-col gap-3 rounded-2xl bg-[var(--surface-2)] p-4">
        <h2 className="text-sm font-semibold text-[var(--sub)]">お子さま</h2>
        <p className="text-xs text-[var(--sub)]">
          2人以上登録すると、記録・タイムライン・傾向で子どもごとに切り替えられるようになります。
          名前の変更と削除は、登録した人だけができます。
        </p>
        {admin.children.length > 0 && (
          <ul className="flex flex-col gap-2">
            {admin.children.map((child) => (
              <li key={child.id} className="rounded-xl bg-[var(--surface)] px-4 py-3 text-sm">
                {admin.editingId === child.id ? (
                  <div className="flex gap-2">
                    <label className="sr-only" htmlFor={`child-name-${child.id}`}>
                      お子さまの名前
                    </label>
                    <input
                      id={`child-name-${child.id}`}
                      value={admin.editingName}
                      onChange={(event) => admin.setEditingName(event.target.value)}
                      maxLength={50}
                      className="flex-1 rounded-xl bg-[var(--surface-2)] px-3 py-2 text-base outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                    <button
                      type="button"
                      onClick={() => void admin.saveName(child)}
                      disabled={admin.saving || !admin.editingName.trim()}
                      className="flex-none rounded-full bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[var(--accent-ink)] disabled:opacity-60"
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={admin.cancelEdit}
                      className="flex-none rounded-full px-3 py-2 text-xs text-[var(--sub)]"
                    >
                      キャンセル
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="flex-1">{child.name}</span>
                    {/* RLS 上、更新・削除できるのは登録した人(created_by)だけ(#128)。
                        それ以外の人にボタンを出すと、押してもエラーになる。 */}
                    {child.created_by === myUserId && (
                      <>
                        <button
                          type="button"
                          onClick={() => admin.startEdit(child)}
                          className="flex-none rounded-full px-3 py-1 text-xs text-[var(--sub)] underline underline-offset-2"
                        >
                          名前を変える
                        </button>
                        <button
                          type="button"
                          onClick={() => admin.requestDelete(child)}
                          className="flex-none rounded-full px-3 py-1 text-xs text-red-600 underline underline-offset-2"
                        >
                          削除
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            aria-label="追加するお子さまの名前"
            value={admin.nameInput}
            onChange={(event) => admin.setNameInput(event.target.value)}
            placeholder="お子さまの名前"
            maxLength={50}
            className="flex-1 rounded-xl bg-[var(--surface)] px-4 py-3 text-base outline-none placeholder:text-[var(--sub)] focus:ring-2 focus:ring-[var(--accent)]"
          />
          <button
            type="button"
            onClick={() => void admin.add()}
            disabled={admin.adding || !admin.nameInput.trim()}
            className="flex-none rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
          >
            {admin.adding ? "追加中..." : "＋追加"}
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={admin.pendingDelete !== null}
        message={`${admin.pendingDelete?.name ?? ""}さんを削除しますか？これまでの記録は残りますが、お子さまの割り当ては外れます。`}
        confirmLabel="削除する"
        onConfirm={() => void admin.confirmDelete()}
        onCancel={admin.cancelDelete}
      />
    </>
  );
}
