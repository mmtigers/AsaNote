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

// 節目。arrive / hwStart / bath / bed は「時間帯」のボタンから1つ選ぶ(bands)。保存するのは帯のid
// (early / mid / late)。menu を持つ節目は「ほか」から時刻も選べて、その場合は "HH:MM" を保存する
// (傾向では、その時刻が属する帯に数える)。dinner だけは時刻で、candidates が初期の候補ボタン(3つ)、
// 使うほど「その項目でよく選ぶ時刻」へ入れ替わる(src/lib/timeCandidates.ts)。
// from〜to を step 分刻みにしたものが「ほか」の選択肢。
// bands の to は帯の終わり(分・その時刻は含まない)。上限が無い最後の帯は Infinity。
export const MILESTONES = [
  {
    key: "arrive",
    label: "帰宅",
    menu: { from: "12:00", to: "17:00", step: 15 },
    bands: [
      { id: "early", label: "14時より前", to: 14 * 60 },
      { id: "mid", label: "14〜15時", to: 15 * 60 },
      { id: "late", label: "15時以降", to: Infinity },
    ],
  },
  {
    key: "hwStart",
    label: "宿題 開始",
    menu: { from: "15:00", to: "20:00", step: 30 },
    bands: [
      { id: "early", label: "15〜17時", to: 17 * 60 },
      { id: "mid", label: "17〜19時", to: 19 * 60 },
      { id: "late", label: "19時以降", to: Infinity },
    ],
  },
  { key: "dinner", label: "夕食", candidates: ["17:30", "18:00", "18:30"], from: "17:00", to: "20:00", step: 30 },
  {
    key: "bath",
    label: "お風呂",
    menu: { from: "15:00", to: "21:00", step: 30 },
    bands: [
      { id: "early", label: "15〜17時", to: 17 * 60 },
      { id: "mid", label: "17〜19時", to: 19 * 60 },
      { id: "late", label: "19時以降", to: Infinity },
    ],
  },
  {
    key: "bed",
    label: "消灯",
    bands: [
      { id: "early", label: "20時より前", to: 20 * 60 },
      { id: "mid", label: "20〜21時", to: 21 * 60 },
      { id: "late", label: "21時以降", to: Infinity },
    ],
  },
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
// 「食べた」のときの理由。「少し」「食べず」のときは DINNER_WHY_TAGS。どちらも evening_records.dinner_why に入る。
export const DINNER_ATE_WHY_TAGS = ["好きなメニュー", "お腹がすいていた", "楽しく食べた", "おかわりした"] as const;

export const DINNER_WHY_TAGS = ["においが苦手", "メニューが好みでない", "テレビに集中", "疲れ・眠い", "食欲がない"] as const;

export const FREE_TIME_TAGS = ["TV", "YouTube", "読書", "ゲーム", "外遊び", "お絵かき"] as const;

export const FRIEND_TAGS = ["約束あり", "約束なし"] as const;

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

export const BODY_TAGS = ["疲れ", "腹痛", "食欲なし", "イライラ", "眠そう"] as const;

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

// 時間帯で選ぶ節目(MILESTONES のうち bands を持つもの)。
export type BandMilestone = Extract<(typeof MILESTONES)[number], { bands: unknown }>;
export type BandMilestoneKey = BandMilestone["key"];
export type BandId = BandMilestone["bands"][number]["id"];
