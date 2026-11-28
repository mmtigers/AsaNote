"use client";

import { useState } from "react";
import { ConfirmDialog } from "@note/core/components/ConfirmDialog";
import { createChild, deleteChild } from "@note/core/db/children";
import { runAction } from "@note/core/group/runAction";
import { formatAge } from "@/lib/age";
import {
  MAX_MUSEUM_NAME_LENGTH,
  MAX_NAME_LENGTH,
  defaultMuseumName,
  museumNameOf,
  saveChildProfile,
  type ChildProfile,
  type ChildProfileInput,
} from "@/lib/db/childProfiles";
import { todayString } from "@/lib/today";

// 「お子さま」の区画(SPEC §4)。名前・誕生日・館の名前を、家族の誰でも直せる(§11 D10)。
// 削除は登録した人だけ(RLS)。お子さまは、あさノート・よるノートと共通(同じ children 表)。
export function ChildProfilesSection({
  profiles,
  currentUserId,
  onChanged,
  onError,
}: {
  profiles: ChildProfile[];
  currentUserId: string;
  /** 追加・保存・削除のあとに呼ぶ(一覧を読み直す)。 */
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const today = todayString();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ChildProfileInput>({ name: "", birthDate: "", museumName: "" });
  const [saving, setSaving] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ChildProfile | null>(null);

  function startEdit(profile: ChildProfile) {
    onError(null);
    setEditingId(profile.id);
    setForm({ name: profile.name, birthDate: profile.birth_date ?? "", museumName: profile.museum_name ?? "" });
  }

  async function save(profile: ChildProfile) {
    onError(null);
    setSaving(true);
    const result = await runAction(() => saveChildProfile(profile.id, form, today), "お子さまの保存に失敗しました", onError);
    if (result.ok) {
      await onChanged();
      setEditingId(null);
    }
    setSaving(false);
  }

  async function add() {
    onError(null);
    setAdding(true);
    const result = await runAction(() => createChild(nameInput), "お子さまの追加に失敗しました", onError);
    if (result.ok) {
      setNameInput("");
      await onChanged();
    }
    setAdding(false);
  }

  async function confirmDelete() {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    onError(null);
    const result = await runAction(() => deleteChild(target.id), "お子さまの削除に失敗しました", onError);
    if (result.ok) await onChanged();
  }

  return (
    <>
      <section className="flex flex-col gap-3 rounded-2xl bg-[var(--surface-2)] p-4">
        <h2 className="text-sm font-semibold text-[var(--sub)]">お子さま</h2>
        <p className="text-xs leading-relaxed text-[var(--sub)]">
          お子さまごとに美術館ができます。誕生日を入れると、作品を作ったときの年齢と学年(年中の部屋・1年生の部屋など)がわかります。
          お子さまは、あさノート・よるノートと共通です。
        </p>

        {profiles.length > 0 && (
          <ul className="flex flex-col gap-2">
            {profiles.map((profile) => (
              <li key={profile.id} className="rounded-xl bg-[var(--surface)] px-4 py-3">
                {editingId === profile.id ? (
                  <div className="flex flex-col gap-3">
                    <label className="flex flex-col gap-1 text-[13px] font-bold">
                      名前
                      <input
                        value={form.name}
                        onChange={(event) => setForm({ ...form, name: event.target.value })}
                        maxLength={MAX_NAME_LENGTH}
                        className="rounded-xl bg-[var(--surface-2)] px-3 py-2 text-base font-normal outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[13px] font-bold">
                      誕生日<span className="text-xs font-normal text-[var(--sub)]">任意。年齢と学年の表示に使います</span>
                      <input
                        type="date"
                        value={form.birthDate}
                        max={today}
                        onChange={(event) => setForm({ ...form, birthDate: event.target.value })}
                        className="rounded-xl bg-[var(--surface-2)] px-3 py-2 text-base font-normal outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[13px] font-bold">
                      館の名前<span className="text-xs font-normal text-[var(--sub)]">任意。空なら「{defaultMuseumName(form.name.trim() || profile.name)}」</span>
                      <input
                        value={form.museumName}
                        onChange={(event) => setForm({ ...form, museumName: event.target.value })}
                        maxLength={MAX_MUSEUM_NAME_LENGTH}
                        placeholder={defaultMuseumName(form.name.trim() || profile.name)}
                        className="rounded-xl bg-[var(--surface-2)] px-3 py-2 text-base font-normal outline-none placeholder:text-[var(--sub)] focus:ring-2 focus:ring-[var(--accent)]"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void save(profile)}
                        disabled={saving || !form.name.trim()}
                        className="flex-1 rounded-full bg-[var(--accent)] py-2.5 text-sm font-bold text-[var(--accent-ink)] disabled:opacity-60"
                      >
                        {saving ? "保存中..." : "保存"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="flex-none rounded-full px-4 py-2.5 text-sm text-[var(--sub)]"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{profile.name}</p>
                      <p className="truncate text-xs text-[var(--sub)]">
                        {museumNameOf(profile)}
                        {profile.birth_date ? ` ・ いま${formatAge(profile.birth_date, today)}` : " ・ 誕生日は未設定"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => startEdit(profile)}
                      className="flex-none rounded-full px-3 py-1 text-xs text-[var(--sub)] underline underline-offset-2"
                    >
                      直す
                    </button>
                    {/* RLS 上、削除できるのは登録した人(created_by)だけ。 */}
                    {profile.created_by === currentUserId && (
                      <button
                        type="button"
                        onClick={() => setPendingDelete(profile)}
                        className="flex-none rounded-full px-3 py-1 text-xs text-[var(--holiday)] underline underline-offset-2"
                      >
                        削除
                      </button>
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
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            placeholder="お子さまの名前"
            maxLength={MAX_NAME_LENGTH}
            className="min-w-0 flex-1 rounded-xl bg-[var(--surface)] px-4 py-3 text-base outline-none placeholder:text-[var(--sub)] focus:ring-2 focus:ring-[var(--accent)]"
          />
          <button
            type="button"
            onClick={() => void add()}
            disabled={adding || !nameInput.trim()}
            className="flex-none rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-bold text-[var(--accent-ink)] disabled:opacity-60"
          >
            {adding ? "追加中..." : "＋追加"}
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={pendingDelete !== null}
        message={`${pendingDelete?.name ?? ""}さんを削除しますか？あさノート・よるノートからも削除されます(記録は残りますが、お子さまの割り当ては外れます)。`}
        confirmLabel="削除する"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
