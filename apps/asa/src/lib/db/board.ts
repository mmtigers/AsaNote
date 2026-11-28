import { createBoardApi } from "@note/core/board";

// 試したこと・検討事項ボード(SPEC)。読み書きの手順は @note/core/board(よるノートと共通)で、
// あさノートのテーブル名だけをここで渡す。
export { CONCERN_TITLE_MAX, RULE_TITLE_MAX, type Concern, type Rule } from "@note/core/board";

export const boardApi = createBoardApi({ rules: "morning_rules", concerns: "morning_concerns" });
