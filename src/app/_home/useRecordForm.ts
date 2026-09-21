"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { findLatestOwnRecordForDate, saveRecord } from "@/lib/db/records";
import { MEMO_MAX_LENGTH, NEGATIVE_REASON_TAGS, OUTCOME_OPTIONS, POSITIVE_REASON_TAGS, type Outcome } from "@/constants/choices";
import { buildDiaryText } from "@/lib/recordPreview";
import { loadDraft } from "./draftStorage";
import { emptyForm, type Step } from "./types";

interface Options {
  date: string;
  userId: string | null | undefined;
  // 複数の子ども対応(#3)。子どもを登録していない家庭では常にnull。
  childId: string | null;
  // タイムラインの「編集する」からの遷移かどうか。true→false化とrefの寿命は
  // 呼び出し側(URLの?date=パラメータを読むeffect)が管理する。
  cameFromEditLink: RefObject<boolean>;
  goToStep: (next: Step, direction: "forward" | "backward") => void;
  restoreStep: (target: Step) => void;
  goHome: () => void;
}

// 選択中の日付の記録フォーム(状態の読み込み・編集・保存)を管理する。
// 保存前の下書き(localStorage)があればそれを優先し、無ければDexieの既存記録
// (無ければ空フォーム)を読み込む。タイムラインの「編集する」から来た場合は、
// 読み込んだ内容に応じたステップまで自動で進める。
export function useRecordForm({ date, userId, childId, cameFromEditLink, goToStep, restoreStep, goHome }: Options) {
  const [form, setForm] = useState(emptyForm);
  const [loaded, setLoaded] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [customReasonTags, setCustomReasonTags] = useState<string[]>([]);
  const [toast, setToast] = useState(false);

  // 下書き復元によるステップ・履歴の復元は、日付+子どもの組み合わせごとに最初の
  // 1回だけ行う。(session?.user.idの解決などでこのeffectが再実行されても、
  // その都度restoreStepを呼ぶとブラウザ履歴に同じステップが重複して積まれ、
  // 「もどる」を押しても1つ前が同じ画面のままになってしまうため)
  const draftRestoredKeyRef = useRef<string | null>(null);
  const restoreKey = `${date}:${childId ?? ""}`;

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 日付切り替え直後に前の日付のフォーム内容を一瞬でも出さないための同期リセット
    setLoaded(false);

    // 保存前の下書きがこの日付のものなら、Dexieの内容より優先して復元する
    // (他の画面を見て戻ってきても、入力途中のデータを失わないため)。
    const draft = loadDraft();
    if (draft && draft.date === date) {
      setForm(draft.form);
      if (draftRestoredKeyRef.current !== restoreKey) {
        draftRestoredKeyRef.current = restoreKey;
        restoreStep(draft.step);
        setDetailOpen(draft.detailOpen);
      }
      setLoaded(true);
      return () => {
        active = false;
      };
    }

    findLatestOwnRecordForDate(date, userId ?? null, childId).then((existing) => {
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
        draftRestoredKeyRef.current = restoreKey;
        const target: Step = existing?.outcome ? "reason" : "result";
        restoreStep(target);
        // 出発時刻は詳細セクションの外(選択式の入力)へ移したので、ここではメモの有無だけを見る。
        setDetailOpen(!!existing?.memo);
      }
      setLoaded(true);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cameFromEditLink/restoreStepは日付が変わるたびの再実行対象ではない(refと安定したコールバック)
  }, [date, userId, childId, restoreKey]);

  const reasonOptions = useMemo(() => {
    const base = form.outcome === "smooth" ? POSITIVE_REASON_TAGS : NEGATIVE_REASON_TAGS;
    return Array.from(new Set([...base, ...customReasonTags, ...form.reasonTags]));
  }, [form.outcome, customReasonTags, form.reasonTags]);

  const preview = useMemo(() => {
    if (!form.outcome) return "「今日はどうだった？」から選んでね。";
    return buildDiaryText(form);
  }, [form]);

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
    // 「行き渋った」を選んだときは、出発時刻もその場で入力できるよう詳細欄を開いておく。
    setDetailOpen(next === "reluctant");
    goToStep("reason", "forward");
  }

  async function handleSave() {
    // #57: textarea の maxLength をすり抜ける経路(貼り付け・下書き復元・IME)があっても、
    // DB の CHECK 制約(2000字)を超えたメモを保存しない。超えると同期が永久に失敗し続ける。
    const memo = form.memo.slice(0, MEMO_MAX_LENGTH);
    await saveRecord({
      id: form.id,
      recordDate: date,
      outcome: form.outcome,
      reasonTags: form.reasonTags,
      departTime: form.departTime || null,
      memo: memo || null,
      wakeTime: form.wakeTime || null,
      wakeTags: form.wakeTags,
      triggerTags: form.triggerTags,
      responseTags: form.responseTags,
      companion: form.companion || null,
      handoff: form.handoff || null,
      userId: userId ?? null,
      childId,
    });
    setToast(true);
    setTimeout(() => setToast(false), 1800);
    goHome();
  }

  const selectedOutcome = OUTCOME_OPTIONS.find((o) => o.value === form.outcome);

  return {
    form,
    setForm,
    loaded,
    detailOpen,
    setDetailOpen,
    customReasonTags,
    setCustomReasonTags,
    toast,
    reasonOptions,
    preview,
    selectedOutcome,
    selectOutcome,
    handleSave,
  };
}
