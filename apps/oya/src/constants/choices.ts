// 日々の記録の選択肢(SPEC §4.1)。値(英字のコード)は DB の check 制約(supabase/schema.sql の oya_records)と同じ。
// 画面の文言・並びはここだけで調整できる(値を変えるときは schema.sql も変える)。
// どの項目も null = 未入力で、選んだ値(「食べていない」「しなかった」など)とは区別する。

export type Meal = "ate" | "little" | "none";
export type Medication = "taken" | "not_taken" | "unsure";
export type Condition = "good" | "normal" | "bad";

export interface Choice<T> {
  value: T;
  label: string;
}

export const MEAL_CHOICES: readonly Choice<Meal>[] = [
  { value: "ate", label: "食べた" },
  { value: "little", label: "少し食べた" },
  { value: "none", label: "食べていない" },
];

export const MEDICATION_CHOICES: readonly Choice<Medication>[] = [
  { value: "taken", label: "飲んだ" },
  { value: "not_taken", label: "飲んでいない" },
  // 「未確認」= 本人が飲んだかどうか分からない(「未入力」とは別)。
  { value: "unsure", label: "わからない(未確認)" },
];

export const CONDITION_CHOICES: readonly Choice<Condition>[] = [
  { value: "good", label: "よい" },
  { value: "normal", label: "ふつう" },
  { value: "bad", label: "わるい" },
];

/** 外出・買い物・病院(した/しなかった)。 */
export const ACTIVITY_CHOICES: readonly Choice<boolean>[] = [
  { value: true, label: "した" },
  { value: false, label: "しなかった" },
];

export const MEMO_MAX_LENGTH = 2000;

export const MEAL_KEYS = ["breakfast", "lunch", "dinner"] as const;
export type MealKey = (typeof MEAL_KEYS)[number];
export const MEAL_LABELS: Record<MealKey, string> = { breakfast: "朝食", lunch: "昼食", dinner: "夕食" };

export const ACTIVITY_KEYS = ["wentOut", "shopping", "hospital"] as const;
export type ActivityKey = (typeof ACTIVITY_KEYS)[number];
export const ACTIVITY_LABELS: Record<ActivityKey, string> = { wentOut: "外出", shopping: "買い物", hospital: "病院" };
