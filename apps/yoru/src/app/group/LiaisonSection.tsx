"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Child } from "@note/core/types/group";
import { WEEKDAYS } from "@note/core/date";
import { runAction } from "@note/core/group/runAction";
import { fetchLiaisonSettings, saveLiaisonSettings } from "@/lib/db/liaisonMemos";
import {
  HOUR_OPTIONS,
  MASKED_NAMES_MAX_COUNT,
  RECIPIENT_LABEL_MAX,
  STYLE_EXAMPLE_MAX,
  STYLE_EXAMPLES_MAX_COUNT,
  TARGET_CHARS_OPTIONS,
  parseMaskedNames,
  type LiaisonSettings,
} from "@/lib/liaisonMemo";

// 「連絡メモ」セクション(docs/liaison-memo.md §3)。療育先などへ毎週送るメモの下書きを、記録から AI で作る設定。
// 設定は子どもごとに家族で共有する(どちらの親が変えても同じ)。オンにするときに、AI に送る内容を示して同意を取る。
export const CONSENT_TEXT = [
  "オンにすると、毎週、この子の直近1週間のあさノート・よるノートの記録(結果・タグ・メモ欄)と、試したこと・検討事項を、AI(Anthropic 社の Claude)に送って下書きを作ります。",
  "家族の方が書いた記録も使います。子どもの名前は「本人」に置き換えて送ります。写真は送りません。",
  "メモ欄に書いた友だち・先生などの名前は、「伏せたい名前」に登録すると「〇〇」に置き換えます。登録していない名前は送られることがあります(「メモ欄も使う」をオフにすると、メモ欄は送りません)。",
];

function formatDay(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

interface Props {
  childList: Child[];
  currentUserId: string;
  onError: (message: string | null) => void;
  // オンにしたとき、この端末で連絡メモの通知を受け取れるようにする(Push の許可を求める)。
  onEnabled: () => Promise<void>;
}

export function LiaisonSection({ childList, currentUserId, onError, onEnabled }: Props) {
  const [settings, setSettings] = useState<Map<string, LiaisonSettings> | null>(null);
  const childIds = childList.map((c) => c.id).join(",");

  useEffect(() => {
    let active = true;
    const ids = childIds ? childIds.split(",") : [];
    runAction(() => fetchLiaisonSettings(ids), "連絡メモの設定の取得に失敗しました", onError).then((result) => {
      if (active && result.ok) setSettings(result.value);
    });
    return () => {
      active = false;
    };
  }, [childIds, onError]);

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-[var(--surface-2)] p-4" aria-labelledby="liaison-heading">
      <h2 id="liaison-heading" className="text-sm font-semibold text-[var(--sub)]">
        連絡メモ
      </h2>
      <p className="text-xs text-[var(--sub)]">
        療育先などへ毎週送るメモの下書きを、直近1週間の記録から作って、決めた曜日・時刻にお知らせします。
        下書きは<Link href="/memo" className="underline">連絡メモ</Link>の画面で直して使えます。
      </p>
      {childList.length === 0 && <p className="text-xs text-[var(--sub)]">先にお子さまを登録してください。</p>}
      {settings &&
        childList.map((child) => {
          const value = settings.get(child.id);
          if (!value) return null;
          return (
            <LiaisonChildCard
              key={child.id}
              child={child}
              showName={childList.length > 1}
              value={value}
              currentUserId={currentUserId}
              onError={onError}
              onSaved={(next) => setSettings(new Map(settings).set(child.id, next))}
              onEnabled={onEnabled}
            />
          );
        })}
    </section>
  );
}

function LiaisonChildCard({
  child,
  showName,
  value,
  currentUserId,
  onError,
  onSaved,
  onEnabled,
}: {
  child: Child;
  showName: boolean;
  value: LiaisonSettings;
  currentUserId: string;
  onError: (message: string | null) => void;
  onSaved: (next: LiaisonSettings) => void;
  onEnabled: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  // 伏せたい名前は、入力中の区切り(改行・読点)を崩さないよう、文字列のまま持ち、保存するときに配列にする。
  const [namesText, setNamesText] = useState(value.maskedNames.join("\n"));
  const [askingConsent, setAskingConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  async function save(next: LiaisonSettings, message: string) {
    onError(null);
    setSaving(true);
    setSavedMessage(null);
    const withNames = { ...next, maskedNames: parseMaskedNames(namesText) };
    const result = await runAction(() => saveLiaisonSettings(withNames), "連絡メモの設定の保存に失敗しました", onError);
    setSaving(false);
    if (!result.ok) return false;
    setDraft(result.value);
    setNamesText(result.value.maskedNames.join("\n"));
    onSaved(result.value);
    setSavedMessage(message);
    return true;
  }

  async function enable() {
    setAskingConsent(false);
    if (await save({ ...draft, enabled: true }, "オンにしました")) await onEnabled();
  }

  const label = showName ? `${child.name}の連絡メモ` : "連絡メモの下書き";
  const exampleSlots = Array.from({ length: STYLE_EXAMPLES_MAX_COUNT }, (_, i) => draft.styleExamples[i] ?? "");

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-[var(--surface)] px-4 py-3 text-sm">
      <label className="flex items-center justify-between gap-3">
        <span className="font-medium">{label}</span>
        <input
          type="checkbox"
          role="switch"
          aria-label={label}
          checked={draft.enabled}
          disabled={saving}
          onChange={(event) => {
            if (event.target.checked) setAskingConsent(true);
            else void save({ ...draft, enabled: false }, "オフにしました");
          }}
          className="h-5 w-5 accent-[var(--accent)]"
        />
      </label>

      {askingConsent && (
        <div className="flex flex-col gap-2 rounded-lg border border-[var(--line)] p-3 text-xs" role="dialog" aria-label="AI に送る内容の確認">
          {CONSENT_TEXT.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => void enable()}
              className="flex-1 rounded-full bg-[var(--accent)] py-2 font-semibold text-[var(--accent-ink)]"
            >
              同意してオンにする
            </button>
            <button type="button" onClick={() => setAskingConsent(false)} className="flex-1 rounded-full border border-[var(--line)] py-2">
              やめる
            </button>
          </div>
        </div>
      )}

      {draft.enabled && draft.consentedAt && (
        <p className="text-xs text-[var(--sub)]">
          {draft.consentedBy === currentUserId ? "あなた" : "家族の方"}が{formatDay(draft.consentedAt)}にオンにしました。
          家族のどなたでもオフにできます。
        </p>
      )}

      {draft.enabled && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-[var(--sub)]">
              曜日
              <select
                value={draft.weekday}
                onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5 text-base text-[var(--ink)]"
              >
                {WEEKDAYS.map((w, i) => (
                  <option key={w} value={i}>
                    {w}曜日
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--sub)]">
              時刻
              <select
                value={draft.hour}
                onChange={(e) => setDraft({ ...draft, hour: Number(e.target.value) })}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5 text-base text-[var(--ink)]"
              >
                {HOUR_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {h}:00
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--sub)]">
              文字数(おうちでのご様子)
              <select
                value={draft.targetChars}
                onChange={(e) => setDraft({ ...draft, targetChars: Number(e.target.value) })}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5 text-base text-[var(--ink)]"
              >
                {TARGET_CHARS_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}字程度
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--sub)]">
              宛先の呼び名
              <input
                value={draft.recipientLabel}
                maxLength={RECIPIENT_LABEL_MAX}
                onChange={(e) => setDraft({ ...draft, recipientLabel: e.target.value })}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5 text-base text-[var(--ink)]"
              />
            </label>
          </div>

          <label className="flex items-center justify-between gap-3 text-xs">
            <span>メモ欄も使う(オフなら、結果とタグだけを送ります)</span>
            <input
              type="checkbox"
              checked={draft.includeMemo}
              onChange={(e) => setDraft({ ...draft, includeMemo: e.target.checked })}
              className="h-5 w-5 accent-[var(--accent)]"
            />
          </label>

          <details className="text-xs">
            <summary className="cursor-pointer text-[var(--sub)]">書き方の見本(任意)</summary>
            <p className="mt-2 text-[var(--sub)]">
              これまでに送った文面を貼っておくと、文体を合わせます。「送った」にした文面がたまると、そちらを優先します。
            </p>
            {exampleSlots.map((example, i) => (
              <textarea
                key={i}
                aria-label={`書き方の見本${i + 1}`}
                value={example}
                maxLength={STYLE_EXAMPLE_MAX}
                rows={3}
                onChange={(e) => {
                  const next = [...exampleSlots];
                  next[i] = e.target.value;
                  setDraft({ ...draft, styleExamples: next });
                }}
                className="mt-2 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5 text-base"
              />
            ))}
          </details>

          <details className="text-xs">
            <summary className="cursor-pointer text-[var(--sub)]">伏せたい名前(任意)</summary>
            <p className="mt-2 text-[var(--sub)]">
              お子さまの呼び名・愛称や、メモ欄に書くことのある友だち・先生などの名前を、1行に1つ書いてください(最大{MASKED_NAMES_MAX_COUNT}件)。AI に送る前に「〇〇」に置き換えます。登録したお子さまの名前は、ここに書かなくても「本人」「きょうだい」に置き換えます。
            </p>
            <textarea
              aria-label="伏せたい名前"
              value={namesText}
              rows={3}
              placeholder={"例: ともくん\n田中"}
              onChange={(e) => setNamesText(e.target.value)}
              className="mt-2 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1.5 text-base"
            />
          </details>

          <button
            type="button"
            disabled={saving}
            onClick={() => void save(draft, "保存しました")}
            className="rounded-full bg-[var(--accent)] py-2.5 text-sm font-semibold text-[var(--accent-ink)] disabled:opacity-60"
          >
            保存する
          </button>
        </>
      )}

      {savedMessage && (
        <p className="text-xs text-[var(--sub)]" role="status">
          {savedMessage}
        </p>
      )}
    </div>
  );
}
