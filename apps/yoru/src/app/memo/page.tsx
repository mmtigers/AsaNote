"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@note/core/components/ConfirmDialog";
import { SkeletonList } from "@note/core/components/Skeleton";
import { describeErrorForUser } from "@note/core/errors";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useChildren } from "@/lib/db/children";
import {
  fetchLiaisonMemos,
  fetchLiaisonSettings,
  markMemoSent,
  requestLiaisonDraft,
  saveMemoEdits,
  unmarkMemoSent,
} from "@/lib/db/liaisonMemos";
import {
  CONTACT_TEXT_MAX,
  INSTRUCTION_MAX,
  MAX_REGENERATIONS,
  MEMO_TEXT_MAX,
  contactBody,
  countChars,
  currentMemo,
  formatPeriod,
  historyBody,
  memoBody,
  upcomingDueDate,
  type LiaisonMemo,
  type LiaisonSettings,
} from "@/lib/liaisonMemo";

// 連絡メモ(docs/liaison-memo.md §7)。療育先などへ毎週送るメモの下書きを、読んで直し、手で書き写す(またはコピーする)画面。
const CARD = "rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm";
const INPUT = "w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5";
const BTN = "rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-[var(--accent-ink)] disabled:opacity-50";
const BTN_SUB = "rounded-full border border-[var(--line)] px-4 py-2.5 text-sm disabled:opacity-50";
// 編集の自動保存までの待ち時間。
const SAVE_DELAY_MS = 800;

function md(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

export default function MemoPage() {
  const { session, loading: authLoading } = useAuth();
  const children = useChildren();
  const [settings, setSettings] = useState<Map<string, LiaisonSettings> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [memos, setMemos] = useState<LiaisonMemo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const childIds = (children ?? []).map((c) => c.id).join(",");
  useEffect(() => {
    if (!session || !childIds) return;
    let active = true;
    fetchLiaisonSettings(childIds.split(","))
      .then((value) => active && setSettings(value))
      .catch((e) => active && setError(describeErrorForUser(e, "連絡メモの設定を読み込めませんでした")));
    return () => {
      active = false;
    };
  }, [session, childIds]);

  const enabledChildren = useMemo(
    () => (children ?? []).filter((c) => settings?.get(c.id)?.enabled),
    [children, settings]
  );
  const childId = selectedId && enabledChildren.some((c) => c.id === selectedId) ? selectedId : (enabledChildren[0]?.id ?? null);
  const childSettings = childId ? (settings?.get(childId) ?? null) : null;

  const reload = useCallback(async () => {
    if (!childId) return;
    try {
      setMemos(await fetchLiaisonMemos(childId));
    } catch (e) {
      setError(describeErrorForUser(e, "連絡メモを読み込めませんでした"));
    }
  }, [childId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 子どもを切り替えたら読み直す(読み込み中の表示に戻す)
    setMemos(null);
    void reload();
  }, [reload]);

  if (authLoading || (session && (children === null || (childIds && settings === null)) && !error)) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6">
        <SkeletonList />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6 pb-8">
      <header>
        <h1 className="text-lg font-bold">連絡メモ</h1>
        <p className="mt-1 text-xs text-[var(--sub)]">直近1週間の記録から作った下書きです。読んで直してから使ってください。</p>
      </header>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {!session && (
        <p className="text-sm text-[var(--sub)]">
          連絡メモを使うには<Link href="/login" className="underline">ログイン</Link>が必要です。
        </p>
      )}

      {session && enabledChildren.length === 0 && (
        <p className="text-sm text-[var(--sub)]">
          連絡メモの下書きがオフになっています。<Link href="/group" className="underline">共有</Link>の「連絡メモ」でオンにしてください。
        </p>
      )}

      {enabledChildren.length > 1 && (
        <div className="flex gap-2" role="tablist" aria-label="子ども">
          {enabledChildren.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={c.id === childId}
              onClick={() => setSelectedId(c.id)}
              className={`rounded-full px-4 py-1.5 text-sm ${c.id === childId ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "border border-[var(--line)]"}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {childId && childSettings && memos === null && <SkeletonList />}
      {childId && childSettings && memos && (
        <MemoBody
          key={childId}
          childId={childId}
          settings={childSettings}
          memos={memos}
          onReload={reload}
          onError={setError}
        />
      )}
    </main>
  );
}

function MemoBody({
  childId,
  settings,
  memos,
  onReload,
  onError,
}: {
  childId: string;
  settings: LiaisonSettings;
  memos: LiaisonMemo[];
  onReload: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const now = new Date();
  const current = currentMemo(memos, now, settings.weekday);
  const dueDate = upcomingDueDate(now, settings.weekday);
  const history = memos.filter((m) => m.id !== current?.id && m.status === "generated");
  const [requesting, setRequesting] = useState(false);

  async function request(instruction: string | null) {
    onError(null);
    setRequesting(true);
    try {
      await requestLiaisonDraft(childId, instruction);
    } catch (e) {
      onError(e instanceof Error ? e.message : "下書きを作れませんでした");
    }
    await onReload();
    setRequesting(false);
  }

  return (
    <>
      <section className={CARD} aria-labelledby="current-heading">
        <h2 id="current-heading" className="text-sm font-semibold">
          今週の連絡メモ({md(dueDate)} {settings.hour}:00 に作成)
        </h2>
        {requesting && <p className="mt-3 text-sm text-[var(--sub)]" role="status">下書きを作っています…(少しかかります)</p>}
        {!requesting && !current && (
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-sm text-[var(--sub)]">まだ作っていません。予定の時刻になると自動で作ります。</p>
            <button type="button" className={BTN} onClick={() => void request(null)}>
              今すぐ作る
            </button>
          </div>
        )}
        {!requesting && current && (
          <CurrentMemo memo={current} settings={settings} onRequest={request} onReload={onReload} onError={onError} />
        )}
      </section>

      {history.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="history-heading">
          <h2 id="history-heading" className="text-sm font-semibold text-[var(--sub)]">
            これまでの連絡メモ
          </h2>
          {history.map((m) => (
            <article key={m.id} className="rounded-2xl bg-[var(--surface-2)] p-3 text-sm">
              <p className="text-xs text-[var(--sub)]">
                {md(m.dueDate)}
                {m.sentAt ? "・送った" : ""}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{historyBody(m)}</p>
            </article>
          ))}
        </section>
      )}
    </>
  );
}

function CurrentMemo({
  memo,
  settings,
  onRequest,
  onReload,
  onError,
}: {
  memo: LiaisonMemo;
  settings: LiaisonSettings;
  onRequest: (instruction: string | null) => Promise<void>;
  onReload: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [text, setText] = useState(memoBody(memo));
  const [contact, setContact] = useState(contactBody(memo));
  const [instruction, setInstruction] = useState("");
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // 編集は少し待ってから自動で保存する(夫婦で同時に編集したら、後から保存したほうが残る)。
  function edit(nextText: string, nextContact: string) {
    setText(nextText);
    setContact(nextContact);
    if (timer.current) clearTimeout(timer.current);
    setSaveState("saving");
    timer.current = setTimeout(() => {
      saveMemoEdits(memo.id, nextText, nextContact)
        .then(() => setSaveState("saved"))
        .catch((e) => {
          setSaveState("idle");
          onError(describeErrorForUser(e, "編集を保存できませんでした"));
        });
    }, SAVE_DELAY_MS);
  }

  async function copy() {
    const body = contact.trim() ? `${text}\n\n【スタッフへの連絡事項】\n${contact}` : text;
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onError("コピーできませんでした。本文を長押ししてコピーしてください");
    }
  }

  async function toggleSent() {
    onError(null);
    try {
      if (memo.sentAt) await unmarkMemoSent(memo.id);
      else await markMemoSent(memo.id, text);
    } catch (e) {
      onError(describeErrorForUser(e, "保存できませんでした"));
    }
    await onReload();
  }

  const remaining = MAX_REGENERATIONS - memo.regenerateCount;
  const edited = memo.editedText !== null || memo.contactEditedText !== null || text !== memoBody(memo) || contact !== contactBody(memo);
  const period = formatPeriod(memo.asaFrom, memo.asaTo);

  if (memo.status === "generating") {
    return (
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-[var(--sub)]" role="status">下書きを作っています。少し待ってから読み込み直してください。</p>
        <button type="button" className={BTN_SUB} onClick={() => void onReload()}>
          読み込み直す
        </button>
      </div>
    );
  }

  if (memo.status === "no_records" || memo.status === "failed") {
    return (
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-[var(--sub)]">
          {memo.status === "no_records" ? "この1週間の記録が無かったため、下書きを作りませんでした。" : `作れませんでした。${memo.error ?? ""}`}
        </p>
        {remaining > 0 && (
          <button type="button" className={BTN} onClick={() => void onRequest(null)}>
            もう一度作る(あと{remaining}回)
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-4">
      {period && <p className="text-xs text-[var(--sub)]">{period}の記録から作成</p>}

      <label className="flex flex-col gap-1">
        <span className="flex justify-between text-xs font-semibold text-[var(--sub)]">
          おうちでのご様子
          <span className="tabular-nums">
            {countChars(text)}字(目安{settings.targetChars}字)
          </span>
        </span>
        <textarea
          value={text}
          maxLength={MEMO_TEXT_MAX}
          rows={5}
          onChange={(e) => edit(e.target.value, contact)}
          className={`${INPUT} text-lg leading-relaxed`}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="flex justify-between text-xs font-semibold text-[var(--sub)]">
          スタッフへの連絡事項
          <span className="tabular-nums">{countChars(contact)}字</span>
        </span>
        <textarea
          value={contact}
          maxLength={CONTACT_TEXT_MAX}
          rows={2}
          placeholder="伝えることが無ければ空のままで"
          onChange={(e) => edit(text, e.target.value)}
          className={`${INPUT} text-lg leading-relaxed`}
        />
      </label>

      <p className="text-xs text-[var(--sub)]" aria-live="polite">
        {saveState === "saving" ? "保存中…" : saveState === "saved" ? "編集を保存しました" : ""}
      </p>

      <div className="flex gap-2">
        <button type="button" className={`${BTN_SUB} flex-1`} onClick={() => void copy()}>
          {copied ? "コピーしました" : "コピー"}
        </button>
        <button type="button" className={`${BTN} flex-1`} onClick={() => void toggleSent()} disabled={!text.trim()}>
          {memo.sentAt ? "「送った」を取り消す" : "送った"}
        </button>
      </div>
      {memo.sentAt && <p className="text-xs text-[var(--sub)]">送った文面は、次回からの書き方の見本になります。</p>}

      <div className="flex flex-col gap-2 border-t border-[var(--line)] pt-3">
        <label className="text-xs text-[var(--sub)]" htmlFor="instruction">
          作り直す(あと{remaining}回)
        </label>
        <input
          id="instruction"
          value={instruction}
          maxLength={INSTRUCTION_MAX}
          placeholder="例: もっと短く/やわらかく/運動会のことを中心に"
          onChange={(e) => setInstruction(e.target.value)}
          className={`${INPUT} text-sm`}
        />
        <button
          type="button"
          className={BTN_SUB}
          disabled={remaining <= 0}
          onClick={() => (edited ? setConfirmRegenerate(true) : void onRequest(instruction))}
        >
          作り直す
        </button>
      </div>

      <ConfirmDialog
        open={confirmRegenerate}
        message="作り直すと、編集した内容は消えます。作り直しますか?"
        confirmLabel="作り直す"
        onConfirm={() => {
          setConfirmRegenerate(false);
          void onRequest(instruction);
        }}
        onCancel={() => setConfirmRegenerate(false)}
      />
    </div>
  );
}
