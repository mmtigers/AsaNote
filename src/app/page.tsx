"use client";

import { useEffect, useMemo, useState } from "react";
import { TagChips } from "@/components/TagChips";
import { AuthStatus } from "@/components/AuthStatus";
import { useAuth } from "@/lib/auth/AuthProvider";
import { findLatestOwnRecordForDate, saveRecord } from "@/lib/db/records";
import {
  COMPANION_OPTIONS,
  HANDOFF_OPTIONS,
  REASON_TAGS,
  RESPONSE_TAGS,
  TRIGGER_TAGS,
  WAKE_TAGS,
} from "@/constants/choices";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateLabel(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})の記録`;
}

interface FormState {
  id: string;
  wakeTime: string;
  wakeTags: string[];
  triggerTags: string[];
  reasonTags: string[];
  responseTags: string[];
  departTime: string;
  companion: string;
  handoff: string;
  memo: string;
}

function emptyForm(): FormState {
  return {
    id: crypto.randomUUID(),
    wakeTime: "",
    wakeTags: [],
    triggerTags: [],
    reasonTags: [],
    responseTags: [],
    departTime: "",
    companion: "",
    handoff: "",
    memo: "",
  };
}

export default function HomePage() {
  const { session } = useAuth();
  const todayValue = useMemo(() => toDateInputValue(new Date()), []);
  const [date, setDate] = useState(todayValue);

  // タイムラインの「編集する」から日付指定で遷移してきた場合はその日付を開く。
  // window.location はマウント後(クライアント)でしか読めないため効果内で行う。
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("date");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URLの初期パラメータをstateへ反映する、マウント時一度きりの初期化
    if (requested) setDate(requested);
  }, []);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loaded, setLoaded] = useState(false);
  const [wakeOptions, setWakeOptions] = useState<string[]>([...WAKE_TAGS]);
  const [triggerOptions, setTriggerOptions] = useState<string[]>([...TRIGGER_TAGS]);
  const [reasonOptions, setReasonOptions] = useState<string[]>([...REASON_TAGS]);
  const [responseOptions, setResponseOptions] = useState<string[]>([...RESPONSE_TAGS]);
  const [toast, setToast] = useState(false);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 日付切り替え直後に前の日付のフォーム内容を一瞬でも出さないための同期リセット
    setLoaded(false);
    findLatestOwnRecordForDate(date, session?.user.id ?? null).then((existing) => {
      if (!active) return;
      if (existing) {
        setForm({
          id: existing.id,
          wakeTime: existing.wakeTime ?? "",
          wakeTags: existing.wakeTags,
          triggerTags: existing.triggerTags,
          reasonTags: existing.reasonTags,
          responseTags: existing.responseTags,
          departTime: existing.departTime ?? "",
          companion: existing.companion ?? "",
          handoff: existing.handoff ?? "",
          memo: existing.memo ?? "",
        });
        setWakeOptions((prev) => Array.from(new Set([...prev, ...existing.wakeTags])));
        setTriggerOptions((prev) => Array.from(new Set([...prev, ...existing.triggerTags])));
        setReasonOptions((prev) => Array.from(new Set([...prev, ...existing.reasonTags])));
        setResponseOptions((prev) => Array.from(new Set([...prev, ...existing.responseTags])));
      } else {
        setForm(emptyForm());
      }
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [date, session?.user.id]);

  function jumpToday() {
    setDate(todayValue);
  }
  function jumpYesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    setDate(toDateInputValue(d));
  }

  const preview = useMemo(() => {
    const segs: string[] = [];
    if (form.wakeTime) {
      let seg = `${form.wakeTime} 起床`;
      if (form.wakeTags.length) seg += `（${form.wakeTags.join("・")}）`;
      segs.push(seg);
    } else if (form.wakeTags.length) {
      segs.push(`起床時は${form.wakeTags.join("・")}`);
    }
    const trig = form.triggerTags.filter((t) => t !== "特になし");
    if (trig.length) segs.push(`前日「${trig.join("・")}」があった様子`);
    if (form.reasonTags.length) segs.push(`「${form.reasonTags.join("・")}」と登校を渋る`);
    if (form.responseTags.length) segs.push(`「${form.responseTags.join("・")}」で対応`);
    let resultSeg = "";
    if (form.departTime) resultSeg += `${form.departTime}に`;
    if (form.companion) resultSeg += `${form.companion}登校`;
    if (resultSeg) segs.push(resultSeg);
    if (form.handoff && form.handoff !== "なし") segs.push(`${form.handoff}に引き渡し`);
    if (form.memo) segs.push(form.memo);
    return segs.length ? segs.join("。") + "。" : "項目を選ぶと、ここに記録文のプレビューが表示されます。";
  }, [form]);

  async function handleSave() {
    await saveRecord({
      id: form.id,
      recordDate: date,
      wakeTime: form.wakeTime || null,
      wakeTags: form.wakeTags,
      triggerTags: form.triggerTags,
      reasonTags: form.reasonTags,
      responseTags: form.responseTags,
      departTime: form.departTime || null,
      companion: form.companion || null,
      handoff: form.handoff || null,
      memo: form.memo || null,
      userId: session?.user.id ?? null,
    });
    setToast(true);
    setTimeout(() => setToast(false), 1800);
  }

  return (
    <div className="mx-auto max-w-md">
      <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--bg)] px-4 pt-5 pb-3">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-xl font-bold">あさノート</h1>
          <AuthStatus />
        </div>
        <p className="mt-1 text-xs text-[var(--sub)]">登校前後のようすを、選ぶだけでサッと記録</p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={jumpToday}
            aria-pressed={date === todayValue}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium ${
              date === todayValue
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
            }`}
          >
            今日
          </button>
          <button
            type="button"
            onClick={jumpYesterday}
            className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--ink)]"
          >
            きのう
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-[13px] text-[var(--sub)]"
          />
        </div>
        <p className="mt-2 text-[15px] font-bold">{formatDateLabel(date)}</p>
      </header>

      <main className="flex flex-col gap-3.5 px-4 py-4">
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold">☀️ 起床</h2>
          <div className="mb-3 flex items-center gap-2.5">
            <label className="w-16 flex-none text-xs text-[var(--sub)]" htmlFor="wakeTime">
              起床時刻
            </label>
            <input
              id="wakeTime"
              type="time"
              value={form.wakeTime}
              onChange={(e) => setForm((f) => ({ ...f, wakeTime: e.target.value }))}
              className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1.5 text-base font-medium tabular-nums"
            />
          </div>
          <TagChips
            options={wakeOptions}
            value={form.wakeTags}
            onChange={(next) => setForm((f) => ({ ...f, wakeTags: next }))}
            onAddCustom={(tag) => setWakeOptions((prev) => [...prev, tag])}
          />
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold">💬 前日のきっかけ</h2>
          <TagChips
            options={triggerOptions}
            value={form.triggerTags}
            onChange={(next) => setForm((f) => ({ ...f, triggerTags: next }))}
            onAddCustom={(tag) => setTriggerOptions((prev) => [...prev, tag])}
          />
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold">✨ 渋る理由</h2>
          <TagChips
            options={reasonOptions}
            value={form.reasonTags}
            onChange={(next) => setForm((f) => ({ ...f, reasonTags: next }))}
            onAddCustom={(tag) => setReasonOptions((prev) => [...prev, tag])}
          />
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold">💚 親の対応</h2>
          <TagChips
            options={responseOptions}
            value={form.responseTags}
            onChange={(next) => setForm((f) => ({ ...f, responseTags: next }))}
            onAddCustom={(tag) => setResponseOptions((prev) => [...prev, tag])}
          />
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold">🚶 登校の結果</h2>
          <div className="mb-3 flex items-center gap-2.5">
            <label className="w-16 flex-none text-xs text-[var(--sub)]" htmlFor="departTime">
              出発時刻
            </label>
            <input
              id="departTime"
              type="time"
              value={form.departTime}
              onChange={(e) => setForm((f) => ({ ...f, departTime: e.target.value }))}
              className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1.5 text-base font-medium tabular-nums"
            />
          </div>
          <p className="mb-1.5 text-xs text-[var(--sub)]">同行者</p>
          <div className="mb-3">
            <TagChips
              options={[...COMPANION_OPTIONS]}
              value={form.companion ? [form.companion] : []}
              onChange={(next) => setForm((f) => ({ ...f, companion: next[0] ?? "" }))}
              multiple={false}
            />
          </div>
          <p className="mb-1.5 text-xs text-[var(--sub)]">引き渡し先</p>
          <TagChips
            options={[...HANDOFF_OPTIONS]}
            value={form.handoff ? [form.handoff] : []}
            onChange={(next) => setForm((f) => ({ ...f, handoff: next[0] ?? "" }))}
            multiple={false}
          />
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold">🚩 振り返りメモ（任意）</h2>
          <textarea
            value={form.memo}
            onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
            placeholder="気づいたこと、次に試したいことなど"
            className="min-h-16 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-sm leading-relaxed outline-none"
          />
        </section>

        <section className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface-2)] p-4">
          <span className="mb-1.5 block text-[11px] uppercase tracking-wide text-[var(--sub)]">
            記録プレビュー
          </span>
          <p className="text-[14.5px] leading-[1.85]">{preview}</p>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-16 z-20 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/90 to-transparent px-4 pt-4 pb-3">
        <div className="mx-auto max-w-md">
          <button
            type="button"
            onClick={handleSave}
            disabled={!loaded}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-3.5 text-base font-bold text-[var(--accent-ink)] shadow-md disabled:opacity-60"
          >
            ✓ この日の記録を保存する
          </button>
        </div>
      </div>

      <div
        className={`fixed bottom-36 left-1/2 z-30 -translate-x-1/2 rounded-full bg-[var(--ink)] px-4 py-2 text-[13px] font-medium text-[var(--bg)] transition-opacity ${
          toast ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        保存しました
      </div>
    </div>
  );
}
