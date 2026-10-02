import type { Outcome } from "@/constants/choices";

export type Step = "home" | "result" | "reason";

export interface FormState {
  id: string;
  outcome: Outcome | null;
  reasonTags: string[];
  departTime: string;
  memo: string;
  // 今日の体調(1〜5、5段階)。任意項目(#3-4)。未入力はnull。
  conditionScale: number | null;
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
    conditionScale: null,
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
  form: FormState;
}
