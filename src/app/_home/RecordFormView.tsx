"use client";

import { useMemo, type ReactNode } from "react";
import {
  DINNER_OPTIONS,
  EFFECT_OPTIONS,
  MEMO_MAX_LENGTH,
  MILESTONES,
  OUTCOME_OPTIONS,
  TAG_FIELDS,
  isRoughOutcome,
  type TagField,
} from "@/constants/choices";
import { formatDateLabel } from "@/lib/date";
import type { LocalRecord } from "@/lib/db/localDb";
import { useRecordPhotos } from "@/lib/db/photos";
import { buildRecordPreview } from "@/lib/recordPreview";
import { countTagUsage, rankTagOptions } from "@/lib/tagOptions";
import { collectMilestoneHistory, rankTimeCandidates, timeMenuOptions } from "@/lib/timeCandidates";
import { COPY_FIELD_OPTIONS, type CopyField } from "./copyToChildren";
import type { FormState } from "./formState";
import type { Child } from "@/types/models";
import { MilestoneRow } from "./MilestoneRow";
import { PhotoStrip } from "./PhotoStrip";
import { TagChips } from "./TagChips";

interface RecordFormViewProps {
  form: FormState;
  onChange: (patch: Partial<FormState>) => void;
  /** 選択肢・時刻候補を使用頻度順にするための、自分の過去の記録(この子の分)。 */
  history: LocalRecord[];
  /** 前日の記録。あれば「昨日と同じにする」を出す。 */
  yesterday: LocalRecord | null;
  childName: string | null;
  /** 記録対象以外の子ども。1人以上いるときだけ「他の子へコピー」を出す。 */
  otherChildren: Child[];
  copy: { childIds: string[]; fields: CopyField[] };
  onCopyChange: (copy: { childIds: string[]; fields: CopyField[] }) => void;
  saving: boolean;
  error: string | null;
  onSave: () => void;
  onBack: () => void;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <h2 className="mb-3 text-[15px] font-bold">
        {title}
        {hint && <span className="ml-1.5 text-[11px] font-normal text-[var(--sub)]">{hint}</span>}
      </h2>
      {children}
    </section>
  );
}

function SubLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 mt-3 text-xs text-[var(--sub)] first:mt-0">{children}</p>;
}

export function RecordFormView({
  form,
  onChange,
  history,
  yesterday,
  childName,
  otherChildren,
  copy,
  onCopyChange,
  saving,
  error,
  onSave,
  onBack,
}: RecordFormViewProps) {
  const photos = useRecordPhotos(form.id);

  const candidatesByKey = useMemo(
    () =>
      Object.fromEntries(
        MILESTONES.map((m) => [m.key, rankTimeCandidates(m.candidates, collectMilestoneHistory(history, m.key))])
      ),
    [history]
  );

  // タグの並びは「使用回数の多い順」。フォームだけにある(まだ保存していない)追加タグも出す。
  const optionsByField = useMemo(() => {
    const out = {} as Record<TagField, string[]>;
    for (const field of Object.keys(TAG_FIELDS) as TagField[]) {
      out[field] = rankTagOptions(
        TAG_FIELDS[field],
        countTagUsage(history, (r) => r[field]),
        form[field]
      );
    }
    return out;
  }, [history, form]);

  function toggle(field: TagField, tag: string) {
    const current = form[field];
    onChange({ [field]: current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag] } as Partial<FormState>);
  }
  function add(field: TagField, tag: string) {
    if (!form[field].includes(tag)) onChange({ [field]: [...form[field], tag] } as Partial<FormState>);
  }
  const chips = (field: TagField, withAdd = true) => (
    <TagChips
      options={optionsByField[field]}
      selected={form[field]}
      onToggle={(tag) => toggle(field, tag)}
      onAdd={withAdd ? (tag) => add(field, tag) : undefined}
    />
  );

  const rough = isRoughOutcome(form.outcome);
  const preview = buildRecordPreview({ ...form, photoCount: photos?.length ?? 0 });

  function carryOverFromYesterday() {
    if (!yesterday) return;
    const times: FormState["times"] = {};
    for (const [key, value] of Object.entries(yesterday.times)) {
      if (value) times[key as keyof FormState["times"]] = value;
    }
    onChange({ times, free: yesterday.free });
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 px-4 pb-28 pt-4">
      <header className="flex items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="text-[13px] text-[var(--sub)] focus:ring-2 focus:ring-[var(--accent)]">
          ← もどる
        </button>
        <h1 className="text-center text-base font-bold">
          {formatDateLabel(form.recordDate)}のきろく
          {childName && <span className="ml-1.5 text-xs font-normal text-[var(--sub)]">{childName}</span>}
        </h1>
        <span className="w-12" aria-hidden />
      </header>

      <Section title="今夜はどうだった?">
        <div className="grid grid-cols-3 gap-2">
          {OUTCOME_OPTIONS.map((o) => {
            const on = form.outcome === o.value;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ outcome: on ? null : o.value })}
                className={`flex flex-col items-center gap-1 rounded-2xl border-2 py-3 text-[13px] font-bold focus:ring-2 focus:ring-[var(--accent)] ${
                  on ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] bg-[var(--surface)]"
                }`}
              >
                <span className="text-2xl">{o.emoji}</span>
                {o.shortLabel}
              </button>
            );
          })}
        </div>
      </Section>

      {yesterday && (
        <div className="flex items-center justify-between px-0.5 text-xs text-[var(--sub)]">
          <span>前日の時刻・自由時間を引き継げます</span>
          <button
            type="button"
            onClick={carryOverFromYesterday}
            className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 font-bold text-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]"
          >
            昨日と同じにする
          </button>
        </div>
      )}

      <Section title="⏰ 節目の時刻" hint="だいたいでOK・近いものをタップ">
        {MILESTONES.map((m) => (
          <MilestoneRow
            key={m.key}
            label={m.label}
            value={form.times[m.key]}
            candidates={candidatesByKey[m.key] ?? m.candidates}
            menu={timeMenuOptions(m.from, m.to, m.step)}
            onChange={(value) => {
              const times = { ...form.times };
              if (value) times[m.key] = value;
              else delete times[m.key];
              onChange({ times });
            }}
          />
        ))}
      </Section>

      <Section title="🍚 夕食">
        <TagChips
          segmented
          options={DINNER_OPTIONS.map((d) => d.label)}
          selected={DINNER_OPTIONS.filter((d) => d.value === form.dinner).map((d) => d.label)}
          onToggle={(label) => {
            const value = DINNER_OPTIONS.find((d) => d.label === label)?.value ?? null;
            onChange({ dinner: form.dinner === value ? null : value });
          }}
        />
        {(form.dinner === "little" || form.dinner === "no") && (
          <>
            <SubLabel>理由</SubLabel>
            {chips("dinnerWhy")}
          </>
        )}
      </Section>

      <Section title="📺 自由時間・友達">
        <SubLabel>自由時間にしたこと</SubLabel>
        {chips("free")}
        <SubLabel>友達・予定</SubLabel>
        {chips("friend")}
      </Section>

      {rough && (
        <Section title="🌩 荒れたときのこと">
          <SubLabel>きっかけ</SubLabel>
          {chips("trigger")}
          <SubLabel>行動</SubLabel>
          {chips("behavior")}
          <SubLabel>親の対応</SubLabel>
          {chips("response")}
          <SubLabel>効いた?</SubLabel>
          <TagChips
            segmented
            options={EFFECT_OPTIONS.map((e) => e.label)}
            selected={EFFECT_OPTIONS.filter((e) => e.value === form.responseEffect).map((e) => e.label)}
            onToggle={(label) => {
              const value = EFFECT_OPTIONS.find((e) => e.label === label)?.value ?? null;
              onChange({ responseEffect: form.responseEffect === value ? null : value });
            }}
          />
        </Section>
      )}

      <Section title="🩺 からだ">{chips("body")}</Section>

      <Section title="📝 メモ" hint="よかったこと・明日の予定なども、ここにまとめて">
        <textarea
          value={form.memo}
          maxLength={MEMO_MAX_LENGTH}
          onChange={(e) => onChange({ memo: e.target.value })}
          placeholder="自由に書けます(例: 友達を家に呼べた / 明日はこらくるで5人と約束)"
          className="min-h-24 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm"
        />
        <p className="mb-3 mt-0.5 text-right text-[11px] text-[var(--sub)]">
          {form.memo.length}/{MEMO_MAX_LENGTH}
        </p>
        <PhotoStrip recordId={form.id} />
      </Section>

      {otherChildren.length > 0 && (
        <Section title="👫 他の子にもコピー" hint="保存するときに反映します">
          <SubLabel>コピー先</SubLabel>
          <TagChips
            options={otherChildren.map((c) => c.name)}
            selected={otherChildren.filter((c) => copy.childIds.includes(c.id)).map((c) => c.name)}
            onToggle={(name) => {
              const id = otherChildren.find((c) => c.name === name)?.id;
              if (!id) return;
              const childIds = copy.childIds.includes(id) ? copy.childIds.filter((x) => x !== id) : [...copy.childIds, id];
              onCopyChange({ ...copy, childIds });
            }}
          />
          {copy.childIds.length > 0 && (
            <>
              <SubLabel>コピーする項目</SubLabel>
              <TagChips
                options={COPY_FIELD_OPTIONS.map((o) => o.label)}
                selected={COPY_FIELD_OPTIONS.filter((o) => copy.fields.includes(o.field)).map((o) => o.label)}
                onToggle={(label) => {
                  const field = COPY_FIELD_OPTIONS.find((o) => o.label === label)?.field;
                  if (!field) return;
                  const fields = copy.fields.includes(field) ? copy.fields.filter((x) => x !== field) : [...copy.fields, field];
                  onCopyChange({ ...copy, fields });
                }}
              />
              <p className="mt-2 text-[11px] text-[var(--sub)]">
                その子の様子・きっかけ・メモはそのままです。記録がまだ無い子は、様子が未入力の記録ができます。
              </p>
            </>
          )}
        </Section>
      )}

      <Section title="記録プレビュー">
        <p className="rounded-2xl bg-[var(--surface-2)] p-3 text-sm leading-relaxed">
          {preview ?? "今夜の様子を選ぶと、選んだ内容から文章を作ってここに表示します。"}
        </p>
      </Section>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 px-4">
        <div className="mx-auto max-w-md">
          <button
            type="button"
            disabled={!form.outcome || saving}
            onClick={onSave}
            className="w-full rounded-full bg-[var(--accent)] py-3.5 text-[15px] font-bold text-[var(--accent-ink)] shadow-lg focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-40"
          >
            ✓ この日の記録を保存する
          </button>
          {!form.outcome && (
            <p className="mt-1 text-center text-xs text-[var(--sub)]">「今夜はどうだった?」を選ぶと保存できます</p>
          )}
        </div>
      </div>
    </main>
  );
}
