"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "@note/core/components/Skeleton";
import { useAuth } from "@/lib/auth/AuthProvider";
import { addDays, diffInDays, toDateInputValue, toMonthOf } from "@note/core/date";
import { resolveEffectiveChildId, useChildren } from "@/lib/db/children";
import { localDb } from "@/lib/db/localDb";
import { discardUnsavedPhotos } from "@/lib/db/photos";
import { useOwnRecordForDate, useOwnRecordsForHistory, useRecordStatusForMonth } from "@/lib/db/queries";
import { formatClock, saveQuickRecord, type QuickOutcome } from "@/lib/db/quickRecord";
import { findLatestOwnRecordForDate, saveRecord } from "@/lib/db/records";
import { setSelectedChildId, useSelectedChildId } from "@/lib/db/selectedChild";
import { track } from "@/lib/analytics";
import { describeErrorForUser } from "@note/core/errors";
import { RECORD_FLOW_RESET_EVENT } from "@/lib/recordFlowReset";
import { DEFAULT_COPY_FIELDS, copyFormToChildren, type CopyField } from "./_home/copyToChildren";
import { clearDraft, loadDraft, saveDraft } from "./_home/draftStorage";
import { emptyForm, formFromRecord, formToInput, type FormState, type Step } from "./_home/formState";
import { HomeStepView } from "./_home/HomeStepView";
import { RecordFormView } from "./_home/RecordFormView";

// 「ホーム(日付を選ぶ)」と「フォーム(入力する)」は同一ルートの2状態。フォームへ進むと
// history.pushState で履歴を1つ積み、ブラウザ/端末の戻るボタンで home へ戻れる(アプリごと閉じない)。
export default function RecordPage() {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user.id ?? null;

  const [today, setToday] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMonth, setViewMonth] = useState<{ year: number; month: number } | null>(null);
  const [step, setStep] = useState<Step>("home");
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copy, setCopy] = useState<{ childIds: string[]; fields: CopyField[] }>({ childIds: [], fields: DEFAULT_COPY_FIELDS });
  const [quickNotice, setQuickNotice] = useState<string | null>(null);

  // popstate など非同期の経路から最新値を読むための参照。
  const formRef = useRef<FormState | null>(null);
  const initialPhotoIdsRef = useRef<string[]>([]);
  const savedRef = useRef(false);
  const initializedRef = useRef(false);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    formRef.current = form;
  }, [form]);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const children = useChildren();
  const selectedChildId = useSelectedChildId();
  const childId = resolveEffectiveChildId(children, selectedChildId);
  const childList = useMemo(() => children ?? [], [children]);

  const monthKey = viewMonth ? `${viewMonth.year}-${String(viewMonth.month).padStart(2, "0")}` : "";
  const statusByDate = useRecordStatusForMonth(monthKey, childId);
  const ownRecord = useOwnRecordForDate(selectedDate ?? "", userId, childId);
  const history = useOwnRecordsForHistory(userId, form ? form.childId : childId);
  const yesterday = useOwnRecordForDate(form ? addDays(form.recordDate, -1) : "", userId, form ? form.childId : childId);

  async function openForm(date: string, forChildId: string | null, entryPoint: "home" | "link" = "home") {
    const existing = await findLatestOwnRecordForDate(date, userId, forChildId);
    const next = existing ? formFromRecord(existing) : emptyForm(date, forChildId);
    const photos = existing ? await localDb.photos.where("recordId").equals(existing.id).toArray() : [];
    initialPhotoIdsRef.current = photos.map((p) => p.id);
    savedRef.current = false;
    setError(null);
    setCopy({ childIds: [], fields: DEFAULT_COPY_FIELDS });
    setForm(next);
    window.history.pushState({ appStep: "form" }, "");
    setStep("form");
    track(
      "evening_record_flow_started",
      { entry_point: entryPoint, is_edit: !!existing, date_offset_days: diffInDays(date, toDateInputValue(new Date())) },
      { userId, recordId: next.id }
    );
  }

  // 初回: 今日の日付を確定し、下書きがあればフォームを復元する。編集リンク(?date=&childId=)も同様。
  // 日付は SSR とずれるため、クライアントでのマウント後に決める。
  /* eslint-disable react-hooks/set-state-in-effect -- マウント後(日付・下書きはクライアントでしか決まらない)に一度だけ初期状態を確定させる */
  useEffect(() => {
    // 自分の記録かどうかの判定(isOwnRecord)に userId が要るので、認証の確定を待つ。
    if (authLoading || initializedRef.current) return;
    initializedRef.current = true;
    const now = toDateInputValue(new Date());
    const params = new URLSearchParams(window.location.search);
    const draft = loadDraft();
    const linkDate = params.get("date");
    const date = linkDate && /^\d{4}-\d{2}-\d{2}$/.test(linkDate) ? linkDate : null;

    window.history.replaceState({ ...(window.history.state ?? {}), appStep: "home" }, "");
    setToday(now);

    if (date) {
      const linkChild = params.get("childId");
      if (linkChild) setSelectedChildId(linkChild);
      window.history.replaceState({ appStep: "home" }, "", "/");
      setSelectedDate(date);
      setViewMonth(toMonthOf(date));
      void openForm(date, linkChild ?? null, "link");
      return;
    }

    if (draft) {
      initialPhotoIdsRef.current = draft.initialPhotoIds;
      savedRef.current = false;
      setSelectedDate(draft.form.recordDate);
      setViewMonth(toMonthOf(draft.form.recordDate));
      setForm(draft.form);
      window.history.pushState({ appStep: "form" }, "");
      setStep("form");
      track("evening_record_flow_resumed", {}, { userId, recordId: draft.form.id });
      return;
    }

    setSelectedDate(now);
    setViewMonth(toMonthOf(now));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 認証の確定後に一度だけ実行する
  }, [authLoading]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // フォームの間は入力内容を下書きとして保存し続ける。
  useEffect(() => {
    if (step === "form" && form) {
      saveDraft({ step: "form", form, initialPhotoIds: initialPhotoIdsRef.current });
    }
  }, [step, form]);

  // 戻るボタン(popstate)でフォームを閉じる。保存済みなら写真は残し、そうでなければ今回追加した分を消す。
  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      const next = (e.state as { appStep?: Step } | null)?.appStep ?? "home";
      if (next === "form") return;
      const current = formRef.current;
      if (current && !savedRef.current) {
        track("evening_record_flow_paused", { reason: "back" }, { userId: userIdRef.current, recordId: current.id });
        void discardUnsavedPhotos(current.id, new Set(initialPhotoIdsRef.current));
      }
      clearDraft();
      setForm(null);
      setError(null);
      setStep("home");
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // 下部ナビの「記録する」を、フォーム表示中に押したらホームへ戻す。
  useEffect(() => {
    function onReset() {
      if (formRef.current) window.history.back();
    }
    window.addEventListener(RECORD_FLOW_RESET_EVENT, onReset);
    return () => window.removeEventListener(RECORD_FLOW_RESET_EVENT, onReset);
  }, []);

  async function onSave() {
    if (!form || !form.outcome || saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveRecord(formToInput(form, userId));
      await copyFormToChildren(form, copy.childIds, copy.fields, userId);
      savedRef.current = true;
      track(
        "evening_record_saved",
        { outcome: form.outcome, child_count_copied: copy.childIds.length },
        { userId, recordId: form.id }
      );
      window.history.back(); // popstate ハンドラがホームへ戻し、下書きを消す
    } catch (e) {
      console.error(e);
      setError(describeErrorForUser(e, "保存に失敗しました"));
    } finally {
      setSaving(false);
    }
  }

  async function onQuick(outcome: QuickOutcome) {
    if (!today) return;
    try {
      await saveQuickRecord({ outcome, recordDate: today, userId, childId });
      setQuickNotice(`${formatClock(new Date())} に残しました`);
    } catch (e) {
      console.error(e);
      setQuickNotice(describeErrorForUser(e, "保存に失敗しました"));
    }
  }

  if (authLoading || !today || !selectedDate || !viewMonth) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-12 w-full" />
      </main>
    );
  }

  if (step === "form" && form) {
    return (
      <RecordFormView
        form={form}
        onChange={(patch) => setForm((f) => (f ? { ...f, ...patch } : f))}
        history={history ?? []}
        yesterday={yesterday ?? null}
        childName={childList.length >= 2 ? (childList.find((c) => c.id === form.childId)?.name ?? null) : null}
        otherChildren={childList.filter((c) => c.id !== form.childId)}
        copy={copy}
        onCopyChange={setCopy}
        saving={saving}
        error={error}
        onSave={onSave}
        onBack={() => window.history.back()}
      />
    );
  }

  return (
    <HomeStepView
      today={today}
      selectedDate={selectedDate}
      onSelectDate={setSelectedDate}
      viewMonth={viewMonth}
      onMonthChange={(year, month) => setViewMonth({ year, month })}
      statusByDate={statusByDate}
      childList={childList}
      childId={childId}
      onSelectChild={setSelectedChildId}
      ownRecord={ownRecord}
      onStart={() => void openForm(selectedDate, childId)}
      onQuick={(o) => void onQuick(o)}
      quickNotice={quickNotice}
    />
  );
}
