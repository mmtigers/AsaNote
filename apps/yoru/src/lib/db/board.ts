import { createBoardApi } from "@note/core/board";

// 試したこと・検討事項ボード(SPEC §4.4)。読み書きの手順は @note/core/board(あさノートと共通)で、
// よるノートのテーブル名だけをここで渡す。
export { CONCERN_TITLE_MAX, RULE_TITLE_MAX, type Concern, type Rule } from "@note/core/board";

export const boardApi = createBoardApi({ rules: "evening_rules", concerns: "evening_concerns" });
