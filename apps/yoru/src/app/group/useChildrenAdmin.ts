"use client";

import { useCallback, useState } from "react";
import { createChild, deleteChild, getChildren, updateChild } from "@/lib/db/children";
import type { Child } from "@/types/models";
import { runAction } from "@note/core/group/runAction";

// 共有設定画面の「お子さま」まわりの状態と操作(#62)。
// 画面(page.tsx)は表示の組み立てだけを持ち、追加・改名・削除の手順はここに閉じる。
export interface ChildrenAdmin {
  children: Child[];
  nameInput: string;
  setNameInput: (value: string) => void;
  adding: boolean;
  /** 編集中の1件。null なら誰も編集していない。 */
  editingId: string | null;
  editingName: string;
  setEditingName: (value: string) => void;
  saving: boolean;
  /** 削除確認中の1件。null なら確認ダイアログは閉じている。 */
  pendingDelete: Child | null;
  reload: () => Promise<void>;
  add: () => Promise<void>;
  startEdit: (child: Child) => void;
  cancelEdit: () => void;
  saveName: (child: Child) => Promise<void>;
  requestDelete: (child: Child) => void;
  cancelDelete: () => void;
  confirmDelete: () => Promise<void>;
}

export function useChildrenAdmin(onError: (message: string | null) => void): ChildrenAdmin {
  const [children, setChildren] = useState<Child[]>([]);
  const [nameInput, setNameInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Child | null>(null);

  const reload = useCallback(async () => {
    setChildren(await getChildren());
  }, []);

  async function add() {
    onError(null);
    setAdding(true);
    const created = await runAction(() => createChild(nameInput), "お子さまの追加に失敗しました", onError);
    if (created.ok) {
      setChildren((prev) => [...prev, created.value]);
      setNameInput("");
    }
    setAdding(false);
  }

  function startEdit(child: Child) {
    setEditingId(child.id);
    setEditingName(child.name);
    onError(null);
  }

  async function saveName(child: Child) {
    onError(null);
    setSaving(true);
    const updated = await runAction(
      () => updateChild(child.id, editingName),
      "お子さまの名前の変更に失敗しました",
      onError
    );
    if (updated.ok) {
      setChildren((prev) => prev.map((c) => (c.id === child.id ? updated.value : c)));
      setEditingId(null);
    }
    setSaving(false);
  }

  async function confirmDelete() {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    onError(null);
    setSaving(true);
    const removed = await runAction(
      () => deleteChild(target.id),
      "お子さまの削除に失敗しました",
      onError
    );
    if (removed.ok) {
      setChildren((prev) => prev.filter((c) => c.id !== target.id));
      if (editingId === target.id) setEditingId(null);
    }
    setSaving(false);
  }

  return {
    children,
    nameInput,
    setNameInput,
    adding,
    editingId,
    editingName,
    setEditingName,
    saving,
    pendingDelete,
    reload,
    add,
    startEdit,
    cancelEdit: () => setEditingId(null),
    saveName,
    requestDelete: setPendingDelete,
    cancelDelete: () => setPendingDelete(null),
    confirmDelete,
  };
}
