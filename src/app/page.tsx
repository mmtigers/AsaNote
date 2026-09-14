"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TagChips } from "@/components/TagChips";
import { AuthStatus } from "@/components/AuthStatus";
import { useAuth } from "@/lib/auth/AuthProvider";
import { findLatestOwnRecordForDate, saveRecord } from "@/lib/db/records";
import { NEGATIVE_REASON_TAGS, OUTCOME_OPTIONS, POSITIVE_REASON_TAGS, type Outcome } from "@/constants/choices";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const OUTCOME_STYLES: Record<Outcome, string> = {
  smooth: "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]",
  reluctant: "border-[var(--amber)] bg-[var(--amber-soft)] text-[var(--amber)]",
  absent: "border-[var(--calm)] bg-[var(--calm-soft)] text-[var(--calm)]",
};

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateLabel(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})`;
}

interface FormState {
  id: string;
  outcome: Outcome | null;
  reasonTags: string[];
  departTime: string;
  memo: string;
  // 旧フォーム由来のフィールド。新しい記録フローでは編集しないが、既存記録が
  // 持っていれば保存時に消してしまわないよう、そのまま保持して積み戻す。
  wakeTime: string;
  wakeTags: string[];
  triggerTags: string[];
  responseTags: string[];
  companion: string;
  handoff: string;
}

function emptyForm(): FormState {
  return {
    id: crypto.randomUUID(),
    outcome: null,
    reasonTags: [],
    departTime: "",
    memo: "",
    wakeTime: "",
    wakeTags: [],
    triggerTags: [],
    responseTags: [],
    companion: "",
    handoff: "",
  };
}

type Step = "home" | "result" | "reason";

export default function HomePage() {
  const { session } = useAuth();
  const todayValue = useMemo(() => toDateInputValue(new Date()), []);
  const [date, setDate] = useState(todayValue);
  const [step, setStep] = useState<Step>("home");
  const [detailOpen, setDetailOpen] = useState(false);

  // タイムラインの「編集する」から日付指定で遷移してきた場合は、その日付を開いた上で
  // 記録内容に応じたステップまで自動で進める(一度きり)。
  const cameFromEditLink = useRef(false);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("date");
    if (requested) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URLの初期パラメータをstateへ反映する、マウント時一度きりの初期化
      setDate(requested);
      cameFromEditLink.current = true;
    }
  }, []);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [loaded, setLoaded] = useState(false);
  const [customReasonTags, setCustomReasonTags] = useState<string[]>([]);
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
          outcome: existing.outcome ?? null,
          reasonTags: existing.reasonTags,
          departTime: existing.departTime ?? "",
          memo: existing.memo ?? "",
          wakeTime: existing.wakeTime ?? "",
          wakeTags: existing.wakeTags,
          triggerTags: existing.triggerTags,
          responseTags: existing.responseTags,
          companion: existing.companion ?? "",
          handoff: existing.handoff ?? "",
        });
      } else {
        setForm(emptyForm());
      }
      if (cameFromEditLink.current) {
        cameFromEditLink.current = false;
        setStep(existing?.outcome ? "reason" : "result");
        setDetailOpen(!!(existing?.departTime || existing?.memo));
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

  function startRecording() {
    setStep("result");
  }

  function selectOutcome(next: Outcome) {
    setForm((f) => {
      const prevIsSmooth = f.outcome === "smooth";
      const nextIsSmooth = next === "smooth";
      return {
        ...f,
        outcome: next,
        reasonTags: prevIsSmooth === nextIsSmooth ? f.reasonTags : [],
      };
    });
    setDetailOpen(false);
    setStep("reason");
  }

  function goBack() {
    if (step === "reason") setStep("result");
    else if (step === "result") setStep("home");
  }

  const reasonOptions = useMemo(() => {
    const base = form.outcome === "smooth" ? POSITIVE_REASON_TAGS : NEGATIVE_REASON_TAGS;
    return Array.from(new Set([...base, ...customReasonTags, ...form.reasonTags]));
  }, [form.outcome, customReasonTags, form.reasonTags]);

  const preview = useMemo(() => {
    if (!form.outcome) return "「今日はどうだった？」から選んでね。";
    const outcomeLabel = OUTCOME_OPTIONS.find((o) => o.value === form.outcome)?.label ?? "";
    const segs: string[] = [outcomeLabel];
    if (form.reasonTags.length) segs.push(`理由は「${form.reasonTags.join("・")}」`);
    if (form.departTime) segs.push(`${form.departTime}に出発`);
    if (form.memo) segs.push(form.memo);
    return segs.join("。") + "。";
  }, [form]);

  async function handleSave() {
    await saveRecord({
      id: form.id,
      recordDate: date,
      outcome: form.outcome,
      reasonTags: form.reasonTags,
      departTime: form.departTime || null,
      memo: form.memo || null,
      wakeTime: form.wakeTime || null,
      wakeTags: form.wakeTags,
      triggerTags: form.triggerTags,
      responseTags: form.responseTags,
      companion: form.companion || null,
      handoff: form.handoff || null,
      userId: session?.user.id ?? null,
    });
    setToast(true);
    setTimeout(() => setToast(false), 1800);
    setStep("home");
  }

  const selectedOutcome = OUTCOME_OPTIONS.find((o) => o.value === form.outcome);

  return (
    <div className="mx-auto max-w-md">
      <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--bg)]/95 px-4 pt-5 pb-3 backdrop-blur-sm">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-xl font-bold">🌸 あさノート</h1>
          <AuthStatus />
        </div>

        {step === "home" ? (
          <>
            <p className="mt-1 text-xs text-[var(--sub)]">今日のようすを、タップだけでサッと記録</p>
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
            <p className="mt-2 text-[15px] font-bold">{formatDateLabel(date)}のきろく</p>
          </>
        ) : (
          <div className="mt-3 flex items-center gap-2.5">
            <button
              type="button"
              onClick={goBack}
              className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[13px] font-medium text-[var(--sub)]"
            >
              ← もどる
            </button>
            <p className="text-[15px] font-bold">{formatDateLabel(date)}のきろく</p>
          </div>
        )}
      </header>

      <main className="flex flex-col gap-3.5 px-4 py-5">
        {step === "home" &&
          (!loaded ? (
            <div className="h-40 animate-pulse rounded-3xl bg-[var(--surface-2)]" />
          ) : selectedOutcome ? (
            <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{selectedOutcome.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{selectedOutcome.label}</p>
                  {form.reasonTags.length > 0 && (
                    <p className="mt-0.5 truncate text-[12px] text-[var(--sub)]">
                      理由: {form.reasonTags.join("・")}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStep("result")}
                className="mt-4 w-full rounded-full border border-[var(--line)] bg-[var(--surface-2)] py-2.5 text-sm font-semibold text-[var(--ink)]"
              >
                ✏️ 記録を編集する
              </button>
            </section>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              className="flex flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-[var(--accent)] bg-[var(--accent-soft)] px-6 py-10 text-center shadow-sm active:scale-[0.98]"
            >
              <span className="text-5xl">📝</span>
              <span className="text-base font-bold text-[var(--accent)]">今日の様子を記録する</span>
              <span className="text-[12px] text-[var(--sub)]">タップして、今日はどうだったか選んでね</span>
            </button>
          ))}

        {step === "result" && (
          <>
            <h2 className="text-[15px] font-bold">今日はどうだった？</h2>
            <div className="flex flex-col gap-3">
              {OUTCOME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => selectOutcome(opt.value)}
                  className={`flex items-center gap-4 rounded-3xl border-2 px-5 py-5 text-left shadow-sm active:scale-[0.98] ${OUTCOME_STYLES[opt.value]}`}
                >
                  <span className="text-4xl">{opt.emoji}</span>
                  <span className="text-base font-bold">{opt.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === "reason" && form.outcome && (
          <>
            <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
              <h2 className="mb-1 text-[15px] font-bold">
                {form.outcome === "smooth" ? "😊 よかった理由は？" : "😣 気になる理由は？"}
              </h2>
              <p className="mb-3 text-[12px] text-[var(--sub)]">思い当たるものを選んでね。無ければ書き足してもOK</p>
              <TagChips
                options={reasonOptions}
                value={form.reasonTags}
                onChange={(next) => setForm((f) => ({ ...f, reasonTags: next }))}
                onAddCustom={(tag) => setCustomReasonTags((prev) => [...prev, tag])}
              />
            </section>

            <button
              type="button"
              onClick={() => setDetailOpen((v) => !v)}
              className="flex items-center justify-center gap-1.5 rounded-full border border-dashed border-[var(--line)] py-2 text-[12px] text-[var(--sub)]"
            >
              詳細を追加(任意) {detailOpen ? "▲" : "▼"}
            </button>

            {detailOpen && (
              <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
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
                <label className="mb-1.5 block text-xs text-[var(--sub)]" htmlFor="memo">
                  振り返りメモ
                </label>
                <textarea
                  id="memo"
                  value={form.memo}
                  onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
                  placeholder="気づいたこと、次に試したいことなど"
                  className="min-h-16 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-sm leading-relaxed outline-none"
                />
              </section>
            )}

            <section className="rounded-3xl border border-dashed border-[var(--line)] bg-[var(--surface-2)] p-4">
              <span className="mb-1.5 block text-[11px] uppercase tracking-wide text-[var(--sub)]">
                記録プレビュー
              </span>
              <p className="text-[14.5px] leading-[1.85]">{preview}</p>
            </section>

            <button
              type="button"
              onClick={handleSave}
              disabled={!loaded}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] py-3.5 text-base font-bold text-[var(--accent-ink)] shadow-md disabled:opacity-60"
            >
              ✓ この日の記録を保存する
            </button>
          </>
        )}
      </main>

      <div
        className={`fixed bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-full bg-[var(--ink)] px-4 py-2 text-[13px] font-medium text-[var(--bg)] transition-opacity ${
          toast ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        💐 保存しました
      </div>
    </div>
  );
}
