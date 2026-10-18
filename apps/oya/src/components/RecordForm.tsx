"use client";

import { useEffect, useState } from "react";
import {
  ACTIVITY_CHOICES,
  ACTIVITY_KEYS,
  ACTIVITY_LABELS,
  CONDITION_CHOICES,
  MEAL_CHOICES,
  MEAL_KEYS,
  MEAL_LABELS,
  MEDICATION_CHOICES,
  MEMO_MAX_LENGTH,
} from "@/constants/choices";
import { ChoiceGroup } from "@/components/ChoiceGroup";
import { CompletionPanel } from "@/components/CompletionPanel";
import { completeOwnRecord, EMPTY_INPUT, fetchRecord, type DailyRecord, type DailyRecordInput, type RevealedPhoto } from "@/lib/db/records";
import { describeServerError } from "@/lib/errors";
import { loadDraft, saveDraft } from "@/lib/recordDraft";
import { RecordValidationError, saveDailyRecord } from "@/lib/saveRecord";

type Message = { kind: "info" | "error"; text: string } | null;

const SAVE_FAILED = "保存できませんでした。入力はこの端末に残っています。電波の良いところで、もう一度押してください。";

/**
 * 1日の記録の入力画面(SPEC §4)。1画面でまとめて入力し、「途中で保存」か「記録を完了する」を押す。
 * - 入力は押すたびに端末へ下書きとして残る(画面を閉じても、保存に失敗しても失われない)。
 * - 完了は、サーバーへの保存が成功してから(saveDailyRecord)。完了すると、その日の孫の写真が出る。
 * - 完了済みの日も修正できる。修正しても完了のままで、写真は増えない(サーバーが1日1回だけ選ぶ)。
 */
export function RecordForm({ userId, familyId, recordDate }: { userId: string; familyId: string; recordDate: string }) {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [record, setRecord] = useState<DailyRecord | null>(null);
  const [input, setInput] = useState<DailyRecordInput>(EMPTY_INPUT);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [completion, setCompletion] = useState<{ photo: RevealedPhoto | null } | null>(null);
  const [needsCompleteRetry, setNeedsCompleteRetry] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 日付が変わったら、その日の記録を読み直す
    setLoaded(false);
    setLoadError(null);
    setMessage(null);
    setCompletion(null);
    setNeedsCompleteRetry(false);
    fetchRecord(userId, recordDate)
      .then((server) => {
        if (cancelled) return;
        const draft = loadDraft(userId, recordDate);
        setRecord(server);
        // 保存していない入力(下書き)が、サーバーの記録より新しければ、そちらを出す。
        if (draft && (!server || draft.savedAt > server.updatedAt)) {
          setInput(draft.input);
          setMessage({ kind: "info", text: "保存していない入力があります。内容を確かめて、保存してください。" });
        } else {
          setInput(server ? toInput(server) : EMPTY_INPUT);
        }
        setLoaded(true);
      })
      .catch((error) => {
        if (cancelled) return;
        // 読み込めなくても、下書きがあれば入力は続けられる(保存のときに、もう一度サーバーへ送る)。
        const draft = loadDraft(userId, recordDate);
        setInput(draft?.input ?? EMPTY_INPUT);
        setLoadError(error);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, recordDate]);

  function update(patch: Partial<DailyRecordInput>) {
    setInput((current) => {
      const next = { ...current, ...patch };
      saveDraft(userId, recordDate, next);
      return next;
    });
  }

  async function save(complete: boolean) {
    setBusy(true);
    setMessage(null);
    setNeedsCompleteRetry(false);
    try {
      const outcome = await saveDailyRecord({ userId, familyId, recordDate, input, complete });
      setRecord(outcome.record);
      setLoadError(null);
      if (outcome.status === "completed") {
        setCompletion({ photo: outcome.photo });
      } else if (outcome.status === "saved-not-completed") {
        setNeedsCompleteRetry(true);
        setMessage({
          kind: "error",
          text: "記録は保存しました。ただ、完了にできませんでした。電波の良いところで、もう一度「記録を完了する」を押してください。",
        });
      } else {
        setMessage({ kind: "info", text: "保存しました。" });
      }
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof RecordValidationError ? error.message : describeServerError(error, SAVE_FAILED) });
    } finally {
      setBusy(false);
    }
  }

  async function showPhotoAgain() {
    setBusy(true);
    setMessage(null);
    try {
      // 何度呼んでも同じ結果(その日の写真は1枚に決まっている)。
      const { photo } = await completeOwnRecord(recordDate);
      setCompletion({ photo });
    } catch (error) {
      setMessage({ kind: "error", text: describeServerError(error, "写真を表示できませんでした。もう一度お試しください。") });
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <p className="text-base text-[var(--sub)]">読み込み中...</p>;

  if (completion) {
    return <CompletionPanel photo={completion.photo} onClose={() => setCompletion(null)} />;
  }

  const completed = Boolean(record?.completedAt);

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void save(!completed);
      }}
    >
      <p
        className={`rounded-2xl px-4 py-3 text-base font-bold ${
          completed ? "bg-[var(--calm-soft)] text-[var(--ink)]" : record ? "bg-[var(--accent-soft)]" : "bg-[var(--surface-2)]"
        }`}
      >
        {completed ? "✓ この日の記録は完了しています(修正できます)" : record ? "途中まで保存しています" : "まだ記録していません"}
      </p>

      {loadError !== null && (
        <p role="alert" className="text-base text-[var(--holiday)]">
          {describeServerError(loadError, "保存済みの記録を読み込めませんでした。")} 入力して保存することはできます。
        </p>
      )}

      <section className="flex flex-col gap-5 rounded-2xl bg-[var(--surface)] p-4">
        <h2 className="text-xl font-bold">食事</h2>
        {MEAL_KEYS.map((key) => (
          <ChoiceGroup key={key} label={MEAL_LABELS[key]} choices={MEAL_CHOICES} value={input[key]} onChange={(value) => update({ [key]: value })} disabled={busy} />
        ))}
      </section>

      <section className="flex flex-col gap-5 rounded-2xl bg-[var(--surface)] p-4">
        <ChoiceGroup label="お薬" choices={MEDICATION_CHOICES} value={input.medication} onChange={(medication) => update({ medication })} disabled={busy} />
      </section>

      <section className="flex flex-col gap-5 rounded-2xl bg-[var(--surface)] p-4">
        <h2 className="text-xl font-bold">今日したこと</h2>
        {ACTIVITY_KEYS.map((key) => (
          <ChoiceGroup key={key} label={ACTIVITY_LABELS[key]} choices={ACTIVITY_CHOICES} value={input[key]} onChange={(value) => update({ [key]: value })} disabled={busy} />
        ))}
      </section>

      <section className="flex flex-col gap-5 rounded-2xl bg-[var(--surface)] p-4">
        <ChoiceGroup label="体調" choices={CONDITION_CHOICES} value={input.condition} onChange={(condition) => update({ condition })} disabled={busy} />
        <label className="flex flex-col gap-2">
          <span className="text-lg font-bold">
            メモ<span className="ml-2 text-sm font-normal text-[var(--sub)]">(書かなくてもかまいません)</span>
          </span>
          <textarea
            value={input.memo}
            maxLength={MEMO_MAX_LENGTH}
            rows={4}
            disabled={busy}
            onChange={(event) => update({ memo: event.target.value })}
            className="rounded-xl bg-[var(--surface-2)] px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </label>
      </section>

      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={`text-base ${message.kind === "error" ? "text-[var(--holiday)]" : ""}`}>
          {message.text}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {completed ? (
          <>
            <button
              type="submit"
              disabled={busy}
              className="min-h-14 rounded-full bg-[var(--accent)] py-4 text-lg font-bold text-[var(--accent-ink)] disabled:opacity-60"
            >
              {busy ? "保存中..." : "修正を保存する"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void showPhotoAgain()}
              className="min-h-12 rounded-full bg-[var(--surface-2)] py-3 text-lg font-bold text-[var(--ink)] disabled:opacity-60"
            >
              この日の写真を見る
            </button>
          </>
        ) : (
          <>
            <button
              type="submit"
              disabled={busy}
              className="min-h-14 rounded-full bg-[var(--accent)] py-4 text-lg font-bold text-[var(--accent-ink)] disabled:opacity-60"
            >
              {busy ? "保存中..." : "記録を完了する"}
            </button>
            {!needsCompleteRetry && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(false)}
                className="min-h-12 rounded-full bg-[var(--surface-2)] py-3 text-lg font-bold text-[var(--ink)] disabled:opacity-60"
              >
                途中で保存する
              </button>
            )}
          </>
        )}
      </div>
    </form>
  );
}

function toInput(record: DailyRecord): DailyRecordInput {
  return {
    breakfast: record.breakfast,
    lunch: record.lunch,
    dinner: record.dinner,
    medication: record.medication,
    wentOut: record.wentOut,
    shopping: record.shopping,
    hospital: record.hospital,
    condition: record.condition,
    memo: record.memo,
  };
}
