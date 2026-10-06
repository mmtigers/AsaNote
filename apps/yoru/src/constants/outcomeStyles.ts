// 結果(outcome)ごとの表示色。カレンダーのドット・傾向タブの積み上げバー・凡例が
// 同じ色を指すよう、ここを唯一の情報源にする。
//
// choices.ts の `color` トークンから `bg-[var(--${color})]` のように組み立てないのは、
// Tailwindが動的に組み立てたクラス名を検出できずスタイルが消えるため。
import type { Outcome } from "./choices";

// 塗り色(ドット・バー本体)。
export const OUTCOME_COLOR_STYLES: Record<Outcome, string> = {
  calm: "bg-[var(--accent)]",
  rough: "bg-[var(--amber)]",
  storm: "bg-[var(--calm)]",
};

// 淡い背景色(カレンダーのセルなど、数字の可読性を保ちたい場所)。
export const OUTCOME_SOFT_STYLES: Record<Outcome, string> = {
  calm: "bg-[var(--accent-soft)]",
  rough: "bg-[var(--amber-soft)]",
  storm: "bg-[var(--calm-soft)]",
};
