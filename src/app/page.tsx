"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TagChips } from "@/components/TagChips";
import { AuthStatus } from "@/components/AuthStatus";
import { MonthCalendar } from "@/components/MonthCalendar";
import { useAuth } from "@/lib/auth/AuthProvider";
import { findLatestOwnRecordForDate, saveRecord } from "@/lib/db/records";
import { useRecordStatusForMonth } from "@/lib/db/queries";
import { NEGATIVE_REASON_TAGS, OUTCOME_OPTIONS, POSITIVE_REASON_TAGS, type Outcome } from "@/constants/choices";
import { DRAFT_STORAGE_KEY, notifyDraftChanged } from "@/lib/draft";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// 記録ボタンのスワイプ判定に使う最小移動距離(px)。これ未満は誤操作防止のため無視する。
const SWIPE_THRESHOLD = 50;

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

function toMonthOf(value: string): { year: number; month: number } {
  const d = new Date(`${value}T00:00:00`);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function addDays(value: string, delta: number): string {
  const d = new Date(`${value}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return toDateInputValue(d);
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

// 各ステップがホームから何回分の画面遷移(=ブラウザ履歴のpushState)を経ているか。
// スマホのバックボタンでホームまで一気に戻したいときに history.go(-depth) で使う。
const STEP_DEPTH: Record<Step, number> = { home: 0, result: 1, reason: 2 };

interface Draft {
  date: string;
  step: Step;
  detailOpen: boolean;
  form: FormState;
}

// 記録の途中でタイムラインなど他の画面を見に行っても、戻ってきたときに入力が
// 消えていないようlocalStorageに一時保存する(保存が完了したら消す使い捨ての下書き)。
function loadDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function saveDraft(draft: Draft) {
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    notifyDraftChanged();
  } catch {
    // プライベートブラウジング等で書き込めない場合はあきらめる(入力自体は継続できる)
  }
}

function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    notifyDraftChanged();
  } catch {
    // 同上
  }
}

export default function HomePage() {
  const { session } = useAuth();
  const todayValue = useMemo(() => toDateInputValue(new Date()), []);
  const [date, setDate] = useState(todayValue);
  // カレンダーに表示中の月。通常は選択中の日付(date)の月と一致するが、
  // カレンダーの◀▶で日付を変えずに月だけ閲覧できるよう別のstateにしている。
  const [displayMonth, setDisplayMonth] = useState(() => toMonthOf(todayValue));
  const [step, setStep] = useState<Step>("home");
  const [detailOpen, setDetailOpen] = useState(false);

  // 選択中の日付を変える(カレンダーのタップ・記録ボタンのスワイプ・「今日」ショートカット
  // から呼ぶ)。表示中の月も選択した日付に合わせて追従させる。
  function changeDate(next: string) {
    setDate(next);
    setDisplayMonth(toMonthOf(next));
  }
  // ステップ間の画面遷移アニメーション用。次の項目へ進むときは右から、
  // 前のステップへ戻るときは左からスライドインさせる。seqは同じステップへ
  // 戻ってきたときでもアニメーションを再生させるためのキー。
  const [stepTransition, setStepTransition] = useState<{ direction: "forward" | "backward"; seq: number }>({
    direction: "forward",
    seq: 0,
  });

  // ステップ遷移(home→result→reason)をブラウザ履歴に積んでおき、スマホ/ブラウザの
  // 戻るボタンでアプリごと閉じてしまわず一つ前のステップに戻れるようにする。
  // 初回マウント時に現在の履歴エントリを「home」として登録しておく(以降の
  // goToStep("forward")呼び出しで、この上にresult→reasonを積んでいく)。
  useEffect(() => {
    window.history.replaceState({ ...(window.history.state ?? {}), appStep: "home" }, "");
  }, []);

  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      const state = e.state as { appStep?: Step } | null;
      const nextStep: Step = state?.appStep ?? "home";
      setStepTransition((t) => ({ direction: "backward", seq: t.seq + 1 }));
      setStep(nextStep);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // draft復元・編集リンクからの自動遷移など、ユーザー操作を介さずにステップを進める場合も、
  // 上と同じ理由でその分の履歴エントリを積んでおく。
  function pushHistoryToStep(target: Step) {
    if (target === "result" || target === "reason") {
      window.history.pushState({ appStep: "result" }, "");
    }
    if (target === "reason") {
      window.history.pushState({ appStep: "reason" }, "");
    }
  }

  // タイムラインの「編集する」から日付指定で遷移してきた場合は、その日付を開いた上で
  // 記録内容に応じたステップまで自動で進める(一度きり)。
  const cameFromEditLink = useRef(false);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("date");
    if (requested) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URLの初期パラメータをstateへ反映する、マウント時一度きりの初期化
      changeDate(requested);
      cameFromEditLink.current = true;
    }
  }, []);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [loaded, setLoaded] = useState(false);
  const [customReasonTags, setCustomReasonTags] = useState<string[]>([]);
  const [toast, setToast] = useState(false);

  const monthKey = `${displayMonth.year}-${String(displayMonth.month).padStart(2, "0")}`;
  const statusByDate = useRecordStatusForMonth(monthKey, session?.user.id ?? null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 日付切り替え直後に前の日付のフォーム内容を一瞬でも出さないための同期リセット
    setLoaded(false);

    // 保存前の下書きがこの日付のものなら、Dexieの内容より優先して復元する
    // (他の画面を見て戻ってきても、入力途中のデータを失わないため)。
    const draft = loadDraft();
    if (draft && draft.date === date) {
      setForm(draft.form);
      pushHistoryToStep(draft.step);
      setStep(draft.step);
      setDetailOpen(draft.detailOpen);
      setLoaded(true);
      return () => {
        active = false;
      };
    }

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
        const target: Step = existing?.outcome ? "reason" : "result";
        pushHistoryToStep(target);
        setStep(target);
        setDetailOpen(!!(existing?.departTime || existing?.memo));
      }
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [date, session?.user.id]);

  // 結果選択・理由入力ステップにいる間は、入力内容を下書きとして保存し続ける。
  // ホームに戻ったとき(保存完了後を含む)は不要になるので下書きを消す。
  useEffect(() => {
    if (!loaded) return;
    if (step === "home") {
      clearDraft();
      return;
    }
    saveDraft({ date, step, detailOpen, form });
  }, [loaded, step, detailOpen, form, date]);

  // 記録ボタンの左右スワイプで前日/翌日に切り替える。左スワイプ→翌日、右スワイプ→前日
  // (紙のカレンダーをめくる感覚)。スワイプが成立した後の合成クリックでボタンの本来の
  // 動作(記録開始・編集画面を開く等)が誤発火しないよう、suppressClickRefで一度だけ抑制する。
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);

  function handleRecordPointerDown(e: React.PointerEvent) {
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
  }
  function handleRecordPointerUp(e: React.PointerEvent) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      suppressClickRef.current = true;
      changeDate(addDays(date, dx < 0 ? 1 : -1));
    }
  }
  function handleRecordClick(action: () => void) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    action();
  }

  function goToStep(next: Step, direction: "forward" | "backward") {
    setStepTransition((t) => ({ direction, seq: t.seq + 1 }));
    setStep(next);
    if (direction === "forward") {
      window.history.pushState({ appStep: next }, "");
    }
  }

  function startRecording() {
    goToStep("result", "forward");
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
    goToStep("reason", "forward");
  }

  function goBack() {
    // ブラウザ履歴を1つ戻す。実際のステップの切り替えはpopstateハンドラが行うことで、
    // このボタンとスマホ/ブラウザの戻るボタンの挙動を一致させる。
    window.history.back();
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
    // 積んであるステップ分の履歴をまとめて戻す(popstateハンドラがhomeへの遷移を処理する)。
    const depth = STEP_DEPTH[step];
    if (depth > 0) window.history.go(-depth);
    else goToStep("home", "backward");
  }

  const selectedOutcome = OUTCOME_OPTIONS.find((o) => o.value === form.outcome);
  // 選択中の日付が今日かどうかで、「今日は/その日は」の文言を出し分ける
  // (過去日を選んでいるのに「今日の様子」と表示されるのはおかしいため)。
  const isTodaySelected = date === todayValue;

  return (
    <div className="mx-auto max-w-md">
      <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--bg)]/95 px-4 pt-5 pb-3 backdrop-blur-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h1 className="whitespace-nowrap text-xl font-bold">🌸 あさノート</h1>
          <AuthStatus />
        </div>

        {step === "home" ? (
          <p className="mt-3 text-[15px] font-bold">{formatDateLabel(date)}のきろく</p>
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

      <main className="flex min-h-[70vh] flex-col overflow-x-hidden px-4 py-5">
        {step === "home" && (
          <div className="mb-4">
            <MonthCalendar
              year={displayMonth.year}
              month={displayMonth.month}
              selectedDate={date}
              todayValue={todayValue}
              statusByDate={statusByDate}
              onSelectDate={changeDate}
              onMonthChange={(year, month) => setDisplayMonth({ year, month })}
            />
          </div>
        )}
        <div
          key={`${step}-${stepTransition.seq}`}
          className={`flex flex-1 flex-col justify-end gap-3.5 ${
            stepTransition.seq === 0
              ? ""
              : stepTransition.direction === "forward"
                ? "step-enter-right"
                : "step-enter-left"
          }`}
        >
          {step === "home" &&
            (!loaded ? (
              <div className="h-40 animate-pulse rounded-3xl bg-[var(--surface-2)]" />
            ) : (
              <div
                onPointerDown={handleRecordPointerDown}
                onPointerUp={handleRecordPointerUp}
                className="touch-pan-y"
              >
                {selectedOutcome ? (
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
                      onClick={() => handleRecordClick(() => goToStep("result", "forward"))}
                      className="mt-4 w-full rounded-full border border-[var(--line)] bg-[var(--surface-2)] py-2.5 text-sm font-semibold text-[var(--ink)]"
                    >
                      ✏️ 記録を編集する
                    </button>
                  </section>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRecordClick(startRecording)}
                    className="flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-[var(--accent)] bg-[var(--accent-soft)] px-6 py-10 text-center shadow-sm active:scale-[0.98]"
                  >
                    <span className="text-5xl">📝</span>
                    <span className="text-base font-bold text-[var(--accent)]">
                      {isTodaySelected ? "今日の様子を記録する" : "この日の様子を記録する"}
                    </span>
                    <span className="text-[12px] text-[var(--sub)]">
                      {isTodaySelected ? "タップして、今日はどうだったか選んでね" : "タップして、この日はどうだったか選んでね"}
                    </span>
                    <span className="text-[11px] text-[var(--sub)]">← 左右にスワイプで日付を切り替え →</span>
                  </button>
                )}
              </div>
            ))}

          {step === "result" && (
            <>
              <h2 className="text-[15px] font-bold">{isTodaySelected ? "今日はどうだった？" : "この日はどうだった？"}</h2>
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
                <section className="step-enter-right rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
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
                className="sticky bottom-4 z-20 mt-1 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] py-3.5 text-base font-bold text-[var(--accent-ink)] shadow-lg disabled:opacity-60"
              >
                ✓ この日の記録を保存する
              </button>
            </>
          )}
        </div>
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
