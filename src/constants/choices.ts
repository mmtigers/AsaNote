// 記録フォームの選択肢の唯一の情報源。増やす/減らす場合はここだけ触ればよい。
// ユーザーはアプリ内で「＋追加」からその場でカスタムタグを増やせるため、ここは
// あくまで初期セット(よくあるもの)に過ぎない。

// 起床時刻の選択肢。6:00〜8:00を15分刻みで用意する(自由入力にしない)。
export const WAKE_TIME_OPTIONS: string[] = (() => {
  const times: string[] = [];
  for (let h = 6; h <= 8; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 8 && m > 0) break;
      times.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return times;
})();

export const RESULT_OPTIONS = ["スムーズに行けた", "渋った"] as const;

export const WAKE_TAGS = [
  "すんなり起床",
  "渋々起床",
  "おねしょ",
  "寝坊気味",
  "眠くてぐずる",
] as const;

export const TRIGGER_TAGS = [
  "友達トラブル",
  "注意された",
  "行事の不安",
  "当番・係が嫌",
  "特になし",
] as const;

export const REASON_TAGS = [
  "当番・係が嫌",
  "行きたくない(理由不明)",
  "お友達関係",
  "眠い・疲れ",
  "天気",
] as const;

export const RESPONSE_TAGS = [
  "時間を決めて待つ",
  "約束する",
  "叱った",
  "譲歩した",
  "パパと交代",
  "ママと交代",
] as const;

export const COMPANION_OPTIONS = [
  "一人で",
  "友達と",
  "親と一緒に",
  "迎えに来てもらった",
] as const;

export const HANDOFF_OPTIONS = ["なし", "担任の先生", "校長先生", "パパ", "ママ"] as const;

export type WakeTag = (typeof WAKE_TAGS)[number] | (string & {});
export type TriggerTag = (typeof TRIGGER_TAGS)[number] | (string & {});
export type ReasonTag = (typeof REASON_TAGS)[number] | (string & {});
export type ResponseTag = (typeof RESPONSE_TAGS)[number] | (string & {});
export type Companion = (typeof COMPANION_OPTIONS)[number] | (string & {});
export type Handoff = (typeof HANDOFF_OPTIONS)[number] | (string & {});
