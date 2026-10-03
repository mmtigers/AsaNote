"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { findLatestOwnRecordForDate, saveRecord } from "@/lib/db/records";
import { MEMO_MAX_LENGTH, NEGATIVE_REASON_TAGS, OUTCOME_OPTIONS, POSITIVE_REASON_TAGS, type Outcome } from "@/constants/choices";
import { useOwnRecordsForReasons } from "@/lib/db/queries";
import { countReasonUsage, rankReasonOptions } from "@/lib/reasonOptions";
import { buildDiaryText } from "@/lib/recordPreview";
import { track } from "@/lib/analytics";
import { diffInDays } from "@/lib/date";
import { loadDraft } from "./draftStorage";
import { emptyForm, type Step } from "./types";

interface Options {
  date: string;
  // 今日の日付("YYYY-MM-DD")。record_flow_startedのdate_offset_days算出用。
  today: string;
  userId: string | null | undefined;
  // 複数の子ども対応(#3)。子どもを登録していない家庭では常にnull。
  childId: string | null;
  // タイムラインの「編集する」からの遷移かどうか。true→false化とrefの寿命は
  // 呼び出し側(URLの?date=パラメータを読むeffect)が管理する。
  cameFromEditLink: RefObject<boolean>;
  restoreStep: (target: Step) => void;
  goHome: () => void;
}

// 選択中の日付の記録フォーム(状態の読み込み・編集・保存)を管理する。
// 保存前の下書き(localStorage)があればそれを優先し、無ければDexieの既存記録
// (無ければ空フォーム)を読み込む。タイムラインの「編集する」から来た場合は、
// 記録フォームを開いた状態にする。
export function useRecordForm({ date, today, userId, childId, cameFromEditLink, restoreStep, goHome }: Options) {
  const [form, setForm] = useState(emptyForm);
  const [loaded, setLoaded] = useState(false);
  const [customReasonTags, setCustomReasonTags] = useState<string[]>([]);
  const [toast, setToast] = useState(false);
  // この日付に元々(このセッション開始前から)outcome入りの記録が既にあったか。
  // record_savedのis_edit判定に使う(#計測)。下書き復元パスはDexieへ問い合わせ直さない
  // ため(既存の性能上の判断。下のuseEffect参照)、その場合はundefinedのまま=不明として
  // 扱い、is_edit自体を送らない。
  const existingOutcomeAtLoadRef = useRef<Outcome | null | undefined>(undefined);
  // handleSaveの直後にgoHome()するときはrecord_flow_pausedを送らないようにするための
  // フラグ。呼び出し側(page.tsx)のstep監視effectが読んでリセットする。
  const justSavedRef = useRef(false);

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
    // 前の日付/子どもでセットされた値が残ったままだと、このセッションのhandleSaveが
    // 別の記録のis_edit判定を使ってしまう(バグ)。日付・子どもが変わるたびに
    // 一旦「不明」へ戻す。
    existingOutcomeAtLoadRef.current = undefined;

    // 保存前の下書きがこの日付のものなら、Dexieの内容より優先して復元する
    // (他の画面を見て戻ってきても、入力途中のデータを失わないため)。
    const draft = loadDraft();
    if (draft && draft.date === date) {
      setForm(draft.form);
      if (draftRestoredKeyRef.current !== restoreKey) {
        draftRestoredKeyRef.current = restoreKey;
        restoreStep(draft.step);
        track("record_flow_resumed", { resumed_step: draft.step }, { userId, recordId: draft.form.id });
      }
      setLoaded(true);
      return () => {
        active = false;
      };
    }

    findLatestOwnRecordForDate(date, userId ?? null, childId).then((existing) => {
      if (!active) return;
      existingOutcomeAtLoadRef.current = existing?.outcome ?? null;
      if (existing) {
        setForm({
          id: existing.id,
          outcome: existing.outcome ?? null,
          reasonTags: existing.reasonTags,
          departTime: existing.departTime ?? "",
          memo: existing.memo ?? "",
          conditionScale: existing.conditionScale ?? null,
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
        restoreStep("form");
        if (existing) {
          track(
            "record_flow_started",
            { entry_point: "timeline_edit_link", is_edit: !!existing.outcome, date_offset_days: diffInDays(today, date) },
            { userId, recordId: existing.id }
          );
        }
      }
      setLoaded(true);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cameFromEditLink/restoreStepは日付が変わるたびの再実行対象ではない(refと安定したコールバック)
  }, [date, userId, childId, restoreKey]);

  // 理由は、自分の過去の記録(この子どもの分)での使用回数が多い順に並べる。追加タグも
  // 記録に残る限り翌日以降の選択肢に出る。まだ読み込み中(undefined)の間は履歴なしとして扱う。
  const reasonHistory = useOwnRecordsForReasons(userId ?? null, childId);
  const reasonOptions = useMemo(() => {
    const positive = form.outcome === "smooth";
    const base = positive ? POSITIVE_REASON_TAGS : NEGATIVE_REASON_TAGS;
    const counts = countReasonUsage(reasonHistory ?? [], positive);
    return rankReasonOptions(base, counts, [...customReasonTags, ...form.reasonTags]);
  }, [form.outcome, customReasonTags, form.reasonTags, reasonHistory]);

  const preview = useMemo(() => {
    if (!form.outcome) return "「今日はどうだった？」から選んでね。";
    return buildDiaryText(form);
  }, [form]);

  function selectOutcome(next: Outcome) {
    // f.outcomeではなくform.outcome(このハンドラ呼び出し時点の値)を見る。setFormの
    // updater内は再実行され得るため、計測イベントはその外で1回だけ送る。
    track(
      "record_outcome_selected",
      { outcome: next, changed_from_existing: form.outcome !== null && form.outcome !== next },
      { userId, recordId: form.id }
    );
    setForm((f) => {
      const prevIsSmooth = f.outcome === "smooth";
      const nextIsSmooth = next === "smooth";
      return {
        ...f,
        outcome: next,
        reasonTags: prevIsSmooth === nextIsSmooth ? f.reasonTags : [],
      };
    });
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
      conditionScale: form.conditionScale,
      wakeTime: form.wakeTime || null,
      wakeTags: form.wakeTags,
      triggerTags: form.triggerTags,
      responseTags: form.responseTags,
      companion: form.companion || null,
      handoff: form.handoff || null,
      userId: userId ?? null,
      childId,
    });
    const properties: Record<string, unknown> = {
      reason_tag_count: form.reasonTags.length,
      has_memo: !!memo,
      depart_time_set: !!form.departTime,
    };
    if (existingOutcomeAtLoadRef.current !== undefined) {
      properties.is_edit = existingOutcomeAtLoadRef.current !== null;
    }
    track("record_saved", properties, { userId, recordId: form.id });
    justSavedRef.current = true;
    setToast(true);
    setTimeout(() => setToast(false), 1800);
    goHome();
  }

  const selectedOutcome = OUTCOME_OPTIONS.find((o) => o.value === form.outcome);

  return {
    form,
    setForm,
    loaded,
    customReasonTags,
    setCustomReasonTags,
    toast,
    reasonOptions,
    preview,
    selectedOutcome,
    selectOutcome,
    handleSave,
    justSavedRef,
  };
}
