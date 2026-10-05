import {
  DINNER_OPTIONS,
  EFFECT_OPTIONS,
  OUTCOME_OPTIONS,
  isRoughOutcome,
  type DinnerState,
  type MilestoneKey,
  type Outcome,
  type ResponseEffect,
} from "@/constants/choices";

export interface PreviewInput {
  outcome: Outcome | null;
  times: Partial<Record<MilestoneKey, string | null>>;
  dinner: DinnerState | null;
  dinnerWhy: readonly string[];
  free: readonly string[];
  trigger: readonly string[];
  behavior: readonly string[];
  response: readonly string[];
  responseEffect: ResponseEffect | null;
  body: readonly string[];
  memo: string | null;
  photoCount: number;
}

const joinTags = (tags: readonly string[]) => tags.join("・");

/**
 * 選んだ内容から日記に近い文章を作る(表示専用。保存はしない)。
 * 結果が未選択のときは null。エクスポートでも同じ関数を使う。
 */
export function buildRecordPreview(input: PreviewInput): string | null {
  const outcome = OUTCOME_OPTIONS.find((o) => o.value === input.outcome);
  if (!outcome) return null;

  const { times } = input;
  const parts: string[] = [`${outcome.phrase}。`];

  if (times.arrive) parts.push(`${times.arrive}ごろに帰宅。`);
  if (times.hwStart) {
    parts.push(
      times.hwEnd ? `宿題は${times.hwStart}ごろから${times.hwEnd}ごろまで。` : `宿題は${times.hwStart}ごろから。`
    );
  } else if (times.hwEnd) {
    parts.push(`宿題は${times.hwEnd}ごろに終了。`);
  }

  const dinner = DINNER_OPTIONS.find((d) => d.value === input.dinner);
  if (dinner) {
    const why = input.dinnerWhy.length > 0 ? `(${joinTags(input.dinnerWhy)})` : "";
    parts.push(`夕食は${dinner.phrase}${why}。`);
  }
  if (input.free.length > 0) parts.push(`自由時間は「${joinTags(input.free)}」。`);

  // 荒れの項目は、荒れた日だけ文章にする(穏やかな日に前の選択が残っていても出さない)。
  if (isRoughOutcome(outcome.value)) {
    if (input.trigger.length > 0) parts.push(`きっかけは「${joinTags(input.trigger)}」。`);
    if (input.behavior.length > 0) parts.push(`${joinTags(input.behavior)}があった。`);
    if (input.response.length > 0) {
      const effect = EFFECT_OPTIONS.find((e) => e.value === input.responseEffect);
      parts.push(`対応は「${joinTags(input.response)}」${effect ? `(${effect.phrase})` : ""}。`);
    }
  }

  if (input.body.length > 0) parts.push(`からだ: ${joinTags(input.body)}。`);
  if (input.photoCount > 0) parts.push(`写真${input.photoCount}枚。`);
  if (times.bed) parts.push(`${times.bed}ごろに消灯。`);

  const memo = input.memo?.trim();
  if (memo) parts.push(memo);

  return parts.join("");
}
