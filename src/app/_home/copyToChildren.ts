import { MILESTONES, type MilestoneKey } from "@/constants/choices";
import { findLatestOwnRecordForDate, saveRecord } from "@/lib/db/records";
import { emptyForm, formFromRecord, formToInput, type FormState } from "./formState";

// 兄弟が同じ出来事に関わる日のために、共通項目を他の子の記録へコピーする(SPEC §6)。
// コピーするのは選んだ項目だけで、様子・きっかけ・メモ・写真など子ども固有のものには触れない。
export type CopyField = `time:${MilestoneKey}` | "dinner" | "free" | "friend";

export const COPY_FIELD_OPTIONS: { field: CopyField; label: string }[] = [
  ...MILESTONES.map((m) => ({ field: `time:${m.key}` as CopyField, label: `${m.label}の時刻` })),
  { field: "dinner", label: "夕食の様子(理由を含む)" },
  { field: "free", label: "自由時間にしたこと" },
  { field: "friend", label: "友達・予定" },
];

// 同じ夕食・同じ就寝になりやすい項目を初期選択にする。
export const DEFAULT_COPY_FIELDS: CopyField[] = ["time:dinner", "time:bed"];

// source の選んだ項目を target に上書きして返す。source 側が未入力の時刻は、target の値を消す
// (「コピー」した結果が元の子と同じになるようにするため)。
export function applyCopyFields(target: FormState, source: FormState, fields: readonly CopyField[]): FormState {
  const next: FormState = { ...target, times: { ...target.times } };
  for (const field of fields) {
    if (field.startsWith("time:")) {
      const key = field.slice(5) as MilestoneKey;
      const value = source.times[key];
      if (value) next.times[key] = value;
      else delete next.times[key];
    } else if (field === "dinner") {
      next.dinner = source.dinner;
      next.dinnerWhy = [...source.dinnerWhy];
    } else if (field === "free") {
      next.free = [...source.free];
    } else if (field === "friend") {
      next.friend = [...source.friend];
    }
  }
  return next;
}

// 他の子のその日の自分の記録へ反映する。無ければ(様子は未入力の)新しい記録を作り、
// 後からその子の記録として開いて完成させられるようにする。
export async function copyFormToChildren(
  source: FormState,
  targetChildIds: readonly string[],
  fields: readonly CopyField[],
  userId: string | null
): Promise<void> {
  if (fields.length === 0) return;
  for (const childId of targetChildIds) {
    if (childId === source.childId) continue;
    const existing = await findLatestOwnRecordForDate(source.recordDate, userId, childId);
    const base = existing ? formFromRecord(existing) : emptyForm(source.recordDate, childId);
    await saveRecord(formToInput(applyCopyFields(base, source, fields), userId));
  }
}
