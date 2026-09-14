import type { Outcome } from "@/constants/choices";

export type Step = "home" | "result" | "reason";

export interface FormState {
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

export function emptyForm(): FormState {
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

export interface Draft {
  date: string;
  step: Step;
  detailOpen: boolean;
  form: FormState;
}
