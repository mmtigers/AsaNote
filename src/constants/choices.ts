// 記録フォームの選択肢の唯一の情報源。増やす/減らす場合はここだけ触ればよい。
// ユーザーはアプリ内で「＋追加」からその場でカスタムタグを増やせるため、ここは
// あくまで初期セット(よくあるもの)に過ぎない。

// メモの最大文字数。supabase/schema.sql の evening_records.memo の CHECK 制約と同じ値にすること。
export const MEMO_MAX_LENGTH = 2000;

// 1日(1人)に添付できる写真の上限。supabase/schema.sql のトリガーと同じ値にすること。
export const PHOTO_MAX_PER_RECORD = 5;

// 今夜の様子。shortLabelは選択ボタン用、labelは記録の表示・文章生成用。
export const OUTCOME_OPTIONS = [
  { value: "calm", label: "穏やか", shortLabel: "穏やか", phrase: "穏やかな夜", emoji: "😌", color: "accent" },
  { value: "rough", label: "少し荒れた", shortLabel: "少し荒れた", phrase: "少し荒れた夜", emoji: "😣", color: "amber" },
  { value: "storm", label: "大荒れ", shortLabel: "大荒れ", phrase: "大荒れの夜", emoji: "🌩", color: "calm" },
] as const;

export type Outcome = (typeof OUTCOME_OPTIONS)[number]["value"];

// 荒れの項目(きっかけ・行動・対応)を出す結果か。
export function isRoughOutcome(outcome: Outcome | null | undefined): boolean {
  return outcome === "rough" || outcome === "storm";
}

// 節目の時刻。candidates は初期の候補ボタン(3つ)で、使うほど「その項目でよく選ぶ時刻」へ
// 入れ替わる(src/lib/timeCandidates.ts)。from〜to を step 分刻みにしたものが「ほか」の選択肢。
export const MILESTONES = [
  { key: "arrive", label: "帰宅", candidates: ["14:45", "15:00", "15:30"], from: "14:00", to: "17:00", step: 15 },
  { key: "hwStart", label: "宿題 開始", candidates: ["15:30", "16:00", "17:00"], from: "15:00", to: "20:00", step: 30 },
  { key: "hwEnd", label: "宿題 終了", candidates: ["16:30", "17:30", "19:30"], from: "15:30", to: "21:00", step: 30 },
  { key: "dinner", label: "夕食", candidates: ["17:30", "18:00", "18:30"], from: "17:00", to: "20:00", step: 30 },
  { key: "bath", label: "お風呂", candidates: ["19:00", "19:30", "20:00"], from: "18:00", to: "21:00", step: 30 },
  { key: "prep", label: "明日の準備 完了", candidates: ["19:30", "20:00", "20:30"], from: "18:00", to: "21:30", step: 30 },
  { key: "bed", label: "消灯", candidates: ["20:00", "20:30", "21:00"], from: "19:30", to: "22:00", step: 15 },
] as const;

export type MilestoneKey = (typeof MILESTONES)[number]["key"];

export const DINNER_OPTIONS = [
  { value: "ate", label: "食べた", phrase: "食べた" },
  { value: "little", label: "少し", phrase: "少し" },
  { value: "no", label: "食べず", phrase: "食べなかった" },
] as const;

export type DinnerState = (typeof DINNER_OPTIONS)[number]["value"];

export const EFFECT_OPTIONS = [
  { value: "good", label: "○ 効いた", phrase: "効いた" },
  { value: "mid", label: "△ 少し", phrase: "少し効いた" },
  { value: "bad", label: "× 効かず", phrase: "効かなかった" },
] as const;

export type ResponseEffect = (typeof EFFECT_OPTIONS)[number]["value"];

// 以下のタグは、使用回数の多い順に並べ替えられる(src/lib/tagOptions.ts)。
export const DINNER_WHY_TAGS = ["においが苦手", "メニューが好みでない", "テレビに集中", "疲れ・眠い", "食欲がない"] as const;

export const FREE_TIME_TAGS = [
  "TV",
  "YouTube",
  "ドラえもん",
  "ゲーム",
  "たまごっち",
  "外遊び",
  "友達と",
  "お絵描き",
  "運動遊び",
] as const;

export const FRIEND_TAGS = ["約束あり", "約束なし", "家に来た", "時間を守れた", "時間を過ぎた"] as const;

export const TRIGGER_TAGS = [
  "時間切れ・間に合わない",
  "ルールが不公平",
  "好きなことを止められた",
  "宿題",
  "食事",
  "眠い・疲れ",
] as const;

export const BEHAVIOR_TAGS = ["号泣", "物を投げる", "暴言", "家出", "物を壊そうとする"] as const;

export const RESPONSE_TAGS = ["時間を宣言", "放置", "一緒に遊ぶ", "取り上げ", "食事を下げる", "気持ちを聞く"] as const;

export const BODY_TAGS = ["蕁麻疹", "眠い・疲れ", "腹痛", "頭痛", "食欲なし"] as const;

// タグ系の項目。EveningRecord のどの配列列に入るかと、初期セットを対応づける。
export const TAG_FIELDS = {
  dinnerWhy: DINNER_WHY_TAGS,
  free: FREE_TIME_TAGS,
  friend: FRIEND_TAGS,
  trigger: TRIGGER_TAGS,
  behavior: BEHAVIOR_TAGS,
  response: RESPONSE_TAGS,
  body: BODY_TAGS,
} as const;

export type TagField = keyof typeof TAG_FIELDS;
