import { MEMO_MAX_LENGTH, type DinnerState, type MilestoneKey, type Outcome, type ResponseEffect } from "@/constants/choices";
import type { RecordFormInput } from "@/lib/db/records";
import type { LocalRecord } from "@/lib/db/localDb";

export type Step = "home" | "form";

export interface FormState {
  id: string;
  recordDate: string;
  childId: string | null;
  outcome: Outcome | null;
  times: Partial<Record<MilestoneKey, string>>;
  dinner: DinnerState | null;
  dinnerWhy: string[];
  free: string[];
  friend: string[];
  trigger: string[];
  behavior: string[];
  response: string[];
  responseEffect: ResponseEffect | null;
  body: string[];
  memo: string;
}

// 下書き。写真は端末のDexieにあるので、下書きには「フォームを開いた時点で既にあった写真のid」だけを
// 持たせる(フォームを破棄するときに、今回追加した分だけを消すため)。
export interface Draft {
  step: Step;
  form: FormState;
  initialPhotoIds: string[];
}

export function emptyForm(recordDate: string, childId: string | null): FormState {
  return {
    id: crypto.randomUUID(),
    recordDate,
    childId,
    outcome: null,
    times: {},
    dinner: null,
    dinnerWhy: [],
    free: [],
    friend: [],
    trigger: [],
    behavior: [],
    response: [],
    responseEffect: null,
    body: [],
    memo: "",
  };
}

export function formFromRecord(record: LocalRecord): FormState {
  const times: FormState["times"] = {};
  for (const [key, value] of Object.entries(record.times)) {
    if (value) times[key as MilestoneKey] = value;
  }
  return {
    id: record.id,
    recordDate: record.recordDate,
    childId: record.childId ?? null,
    outcome: record.outcome,
    times,
    dinner: record.dinner,
    dinnerWhy: record.dinnerWhy,
    free: record.free,
    friend: record.friend,
    trigger: record.trigger,
    behavior: record.behavior,
    response: record.response,
    responseEffect: record.responseEffect,
    body: record.body,
    memo: record.memo ?? "",
  };
}

export function formToInput(form: FormState, userId: string | null): RecordFormInput {
  return {
    id: form.id,
    recordDate: form.recordDate,
    childId: form.childId,
    userId,
    outcome: form.outcome,
    times: form.times,
    dinner: form.dinner,
    dinnerWhy: form.dinnerWhy,
    free: form.free,
    friend: form.friend,
    trigger: form.trigger,
    behavior: form.behavior,
    response: form.response,
    responseEffect: form.responseEffect,
    body: form.body,
    memo: form.memo.slice(0, MEMO_MAX_LENGTH),
  };
}
