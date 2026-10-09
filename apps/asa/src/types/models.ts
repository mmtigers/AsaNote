import type { Outcome } from "@/constants/choices";

// グループ・子どもの型は共通表のものなので @note/core にある。import 元を変えずに済むよう、ここから再エクスポートする。
export type { Child, Group, GroupInvite, GroupMemberProfile } from "@note/core/types/group";

// 登校渋りの朝の様子を1日1〜数件記録するレコード。
export interface SchoolRecord {
  id: string;
  recordDate: string; // "YYYY-MM-DD"
  // 登校の結果(スムーズ/行き渋り/お休み)。未入力(結果を選ぶ前・過去の記録)はnull/undefined。
  outcome?: Outcome | null;
  wakeTime: string | null; // "HH:MM"
  wakeTags: string[];
  triggerTags: string[];
  reasonTags: string[];
  responseTags: string[];
  departTime: string | null; // "HH:MM"
  companion: string | null;
  handoff: string | null;
  memo: string | null;
  // クラウド未同期のうちは未設定(=自分の記録として扱う)。同期・pull後はSupabaseの
  // user_idが入り、パートナーの記録かどうかの判定(グループ共有機能)に使う。
  userId?: string | null;
  // 複数の子どもがいる家庭向け(#3)。子どもを登録していない(0〜1人の)家庭では
  // 常にnull("未分類")のまま。
  childId?: string | null;
  createdAt: string;
  updatedAt: string;
}

