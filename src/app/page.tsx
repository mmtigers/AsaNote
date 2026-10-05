"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { MonthCalendar } from "@/components/MonthCalendar";
import { ChildSwitcher } from "@/components/ChildSwitcher";
import { PartnerRecordStatus } from "@/components/PartnerRecordStatus";
import { RecordReminderNotice } from "@/components/RecordReminderNotice";
import { ReleaseNotice } from "@/components/ReleaseNotice";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useChildren, useEffectiveChildId } from "@/lib/db/children";
import { setSelectedChildId } from "@/lib/db/selectedChild";
import { useRecordStatusForMonth } from "@/lib/db/queries";
import { RecordHeader } from "./_home/RecordHeader";
import { HomeStepView } from "./_home/HomeStepView";
import { RecordFormView } from "./_home/RecordFormView";
import { useStepNavigation } from "./_home/useStepNavigation";
import { useRecordForm } from "./_home/useRecordForm";
import { useDraftPersistence } from "./_home/useDraftPersistence";
import type { Step } from "./_home/types";
import { addDays, diffInDays, formatDateLabel, toDateInputValue, toMonthOf } from "@/lib/date";
import { useRecordFlowResetListener } from "@/lib/recordFlowReset";
import { track } from "@/lib/analytics";

// 記録ボタンのスワイプ判定に使う最小移動距離(px)。これ未満は誤操作防止のため無視する。
const SWIPE_THRESHOLD = 50;

export default function HomePage() {
  const { session } = useAuth();
  const todayValue = useMemo(() => toDateInputValue(new Date()), []);
  const [date, setDate] = useState(todayValue);
  // カレンダーに表示中の月。通常は選択中の日付(date)の月と一致するが、
  // カレンダーの◀▶で日付を変えずに月だけ閲覧できるよう別のstateにしている。
  const [displayMonth, setDisplayMonth] = useState(() => toMonthOf(todayValue));

  // 選択中の日付を変える(カレンダーのタップ・記録ボタンのスワイプ・「今日」ショートカット
  // から呼ぶ)。表示中の月も選択した日付に合わせて追従させる。
  function changeDate(next: string) {
    setDate(next);
    setDisplayMonth(toMonthOf(next));
  }

  const { step, stepTransition, goToStep, restoreStep, goBack, goHome } = useStepNavigation();

  // タイムラインの「編集する」から日付指定で遷移してきた場合は、その日付(+子ども)を
  // 開いた上で記録内容に応じたステップまで自動で進める(一度きり)。
  // editChildIdOverrideは、子ども一覧の取得(非同期)が完了する前でも正しい子どもで
  // 記録を検索できるようにするための同期的な上書き値(useEffectiveChildIdは
  // useChildren()の読み込み中はnullを返してしまうため)。
  const cameFromEditLink = useRef(false);
  const [editChildIdOverride, setEditChildIdOverride] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedDate = params.get("date");
    const requestedChildId = params.get("childId");
    if (requestedDate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URLの初期パラメータをstateへ反映する、マウント時一度きりの初期化
      changeDate(requestedDate);
      if (requestedChildId) {
        setEditChildIdOverride(requestedChildId);
        setSelectedChildId(requestedChildId);
      }
      cameFromEditLink.current = true;
    }
  }, []);

  const children = useChildren();
  const resolvedChildId = useEffectiveChildId();
  const effectiveChildId = editChildIdOverride ?? resolvedChildId;

  // 子ども切り替えUIを直接操作したら、編集リンク由来の上書きは役目を終える
  // (以後は通常通りuseEffectiveChildIdの解決結果に従う)。
  function handleSelectChild(id: string | null) {
    setEditChildIdOverride(null);
    setSelectedChildId(id);
  }

  const monthKey = `${displayMonth.year}-${String(displayMonth.month).padStart(2, "0")}`;
  const statusByDate = useRecordStatusForMonth(monthKey, effectiveChildId);

  const {
    form,
    setForm,
    loaded,
    setCustomReasonTags,
    toast,
    saveError,
    reasonOptions,
    preview,
    selectedOutcome,
    selectOutcome,
    handleSave,
    justSavedRef,
  } = useRecordForm({
    date,
    today: todayValue,
    userId: session?.user.id,
    childId: effectiveChildId,
    cameFromEditLink,
    restoreStep,
    goHome,
  });

  useDraftPersistence({ loaded, date, step, form });

  // 記録フローの途中で下部ナビの「記録する」を押したときは、最初の画面へ戻す
  // (既にホームにいるため、Linkだけでは画面が変わらない)。
  const pauseReasonRef = useRef<"bottom_nav_reset" | null>(null);
  const resetToHomeStep = useCallback(() => {
    if (step !== "home") {
      pauseReasonRef.current = "bottom_nav_reset";
      goHome();
    }
  }, [step, goHome]);
  useRecordFlowResetListener(resetToHomeStep);

  // ステップ遷移の計測(record_step_viewed)と、保存を伴わずにhomeへ戻ったときの
  // 離脱計測(record_flow_paused)。戻る/下部ナビでのリセットはuseDraftPersistence側で
  // stepがhomeになった時点で下書きも消えるため、この経路での「中断」は実際には
  // 入力内容が失われる離脱であり、その後に自動で再開されることはない。
  // record_flow_resumedが対応するのは、アプリ/タブを閉じて(=step===homeを経由せず)
  // 離れ、下書きが残ったまま後で再訪したケースのみ(このeffectでは検知できない)。
  const lastNonHomeStepRef = useRef<Step>("home");
  useEffect(() => {
    if (stepTransition.seq === 0 || !loaded) return;
    if (step === "home") {
      if (justSavedRef.current) {
        justSavedRef.current = false;
      } else {
        track(
          "record_flow_paused",
          { last_step: lastNonHomeStepRef.current, reason: pauseReasonRef.current ?? "back_navigation" },
          { userId: session?.user.id, recordId: form.id }
        );
      }
      pauseReasonRef.current = null;
      return;
    }
    lastNonHomeStepRef.current = step;
    track("record_step_viewed", { step, direction: stepTransition.direction }, { userId: session?.user.id, recordId: form.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ステップ遷移(seq)が変わった時だけ発火させたい
  }, [stepTransition.seq]);

  // 記録ボタンの左右スワイプで前日/翌日に切り替える。左スワイプ→翌日、右スワイプ→前日
  // (紙のカレンダーをめくる感覚)。スワイプが成立した後の合成クリックでボタンの本来の
  // 動作(記録開始・編集画面を開く等)が誤発火しないよう、suppressClickRefで一度だけ抑制する。
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);

  function handleRecordPointerDown(e: PointerEvent) {
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
  }
  function handleRecordPointerUp(e: PointerEvent) {
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

  function startRecording(entryPoint: "home_start_button" | "push_reminder", dateOffsetDays: number) {
    track(
      "record_flow_started",
      { entry_point: entryPoint, is_edit: false, date_offset_days: dateOffsetDays },
      { userId: session?.user.id, recordId: form.id }
    );
    goToStep("form", "forward");
  }

  // リマインダーの「記録する」は常に「今日」の記録を指す(現在カレンダーで別の日を
  // 見ていても、今日に切り替えてから記録画面へ進む)。dateはまだ更新前のためdiffInDaysを
  // 使わず0を直接渡す。
  function handleReminderStartRecording() {
    changeDate(todayValue);
    startRecording("push_reminder", 0);
  }

  // すでにその日の記録がある状態から「記録を編集する」を押したときの起点
  // (record_flow_startedのentry_point: "home_edit_existing")。
  function startEditingExisting() {
    track(
      "record_flow_started",
      { entry_point: "home_edit_existing", is_edit: true, date_offset_days: diffInDays(todayValue, date) },
      { userId: session?.user.id, recordId: form.id }
    );
    goToStep("form", "forward");
  }

  // 選択中の日付が今日かどうかで、「今日は/その日は」の文言を出し分ける
  // (過去日を選んでいるのに「今日の様子」と表示されるのはおかしいため)。
  const isTodaySelected = date === todayValue;

  return (
    <div className="mx-auto max-w-md">
      <RecordHeader step={step} dateLabel={formatDateLabel(date)} onBack={goBack} />

      <main className="flex min-h-[70vh] flex-col overflow-x-hidden px-4 py-5">
        {step === "home" && <ReleaseNotice />}
        {step === "home" && <PartnerRecordStatus childId={effectiveChildId} />}
        {step === "home" && children && children.length > 1 && (
          <div className="mb-3">
            <ChildSwitcher childList={children} selectedId={effectiveChildId} onSelect={handleSelectChild} />
          </div>
        )}
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
        {step === "home" && <RecordReminderNotice onStartRecording={handleReminderStartRecording} />}
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
          {step === "home" && (
            <HomeStepView
              loaded={loaded}
              selectedOutcome={selectedOutcome}
              reasonTags={form.reasonTags}
              isTodaySelected={isTodaySelected}
              onPointerDown={handleRecordPointerDown}
              onPointerUp={handleRecordPointerUp}
              onRecordClick={handleRecordClick}
              onEditRecord={startEditingExisting}
              onStartRecording={() => startRecording("home_start_button", diffInDays(todayValue, date))}
            />
          )}

          {step === "form" && (
            <RecordFormView
              isTodaySelected={isTodaySelected}
              outcome={form.outcome}
              onSelectOutcome={selectOutcome}
              reasonOptions={reasonOptions}
              reasonTags={form.reasonTags}
              onReasonTagsChange={(next) => setForm((f) => ({ ...f, reasonTags: next }))}
              onAddCustomReasonTag={(tag) => setCustomReasonTags((prev) => [...prev, tag])}
              wakeTime={form.wakeTime}
              onWakeTimeChange={(value) => setForm((f) => ({ ...f, wakeTime: value }))}
              departTime={form.departTime}
              onDepartTimeChange={(value) => setForm((f) => ({ ...f, departTime: value }))}
              memo={form.memo}
              onMemoChange={(value) => setForm((f) => ({ ...f, memo: value }))}
              preview={preview}
              loaded={loaded}
              saveError={saveError}
              onSave={handleSave}
            />
          )}
        </div>
      </main>

      <div
        role="status"
        aria-live="polite"
        className={`fixed bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-full bg-[var(--ink)] px-4 py-2 text-[13px] font-medium text-[var(--bg)] transition-opacity ${
          toast ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {toast && "💐 保存しました"}
      </div>
    </div>
  );
}
