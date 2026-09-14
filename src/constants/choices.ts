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

// 登校の結果。3択(スムーズ/行き渋り/お休み)で、以降の「理由」の選択肢を出し分ける。
export const OUTCOME_OPTIONS = [
  { value: "smooth", label: "スムーズに行けた", emoji: "😊", color: "accent" },
  { value: "reluctant", label: "行き渋った", emoji: "😣", color: "amber" },
  { value: "absent", label: "行かなかった", emoji: "🏠", color: "calm" },
] as const;

export type Outcome = (typeof OUTCOME_OPTIONS)[number]["value"];

// スムーズに行けた日の「思い当たる理由」。
export const POSITIVE_REASON_TAGS = [
  "早寝早起きできた",
  "朝ごはんをしっかり食べた",
  "楽しみな行事があった",
  "前日に安心して眠れた",
  "天気が良かった",
  "特に理由はない",
] as const;

// 行き渋った・行かなかった日の「思い当たる理由」(旧: 前日のきっかけ+渋る理由を統合)。
export const NEGATIVE_REASON_TAGS = [
  "友達トラブル",
  "注意された",
  "行事の不安",
  "当番・係が嫌",
  "行きたくない(理由不明)",
  "お友達関係",
  "眠い・疲れ",
  "体調がすぐれない",
  "天気",
] as const;

export type ReasonTag = (typeof POSITIVE_REASON_TAGS)[number] | (typeof NEGATIVE_REASON_TAGS)[number] | (string & {});

// 以下は旧フォーム(〜v1)で使っていた選択肢。当時の記録をタイムライン/傾向で表示する
// ためだけに残しており、新しい記録フォームからは入力しない。
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
export type ResponseTag = (typeof RESPONSE_TAGS)[number] | (string & {});
export type Companion = (typeof COMPANION_OPTIONS)[number] | (string & {});
export type Handoff = (typeof HANDOFF_OPTIONS)[number] | (string & {});
