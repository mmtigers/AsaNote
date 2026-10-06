import type { DinnerState, MilestoneKey, Outcome, ResponseEffect } from "@/constants/choices";

// グループ・子どもの型は共通表のものなので @note/core にある。import 元を変えずに済むよう、ここから再エクスポートする。
export type { Child, Group, GroupInvite, GroupMemberProfile } from "@note/core/types/group";

// 夜の記録(1日×1人の子ども)。時刻は "HH:MM"、未入力は null。
export interface EveningRecord {
  id: string;
  recordDate: string; // "YYYY-MM-DD"
  outcome: Outcome | null;
  times: Partial<Record<MilestoneKey, string | null>>;
  dinner: DinnerState | null;
  dinnerWhy: string[];
  free: string[];
  friend: string[];
  trigger: string[];
  behavior: string[];
  response: string[];
  responseEffect: ResponseEffect | null;
  body: string[];
  memo: string | null;
  // クラウド未同期のうちは未設定(=自分の記録として扱う)。同期・pull後はSupabaseのuser_idが入る。
  userId?: string | null;
  // 子どもを登録していない(0〜1人の)家庭では常にnull("未分類")。
  childId?: string | null;
  createdAt: string;
  updatedAt: string;
}

// 記録に添付する写真。blob は端末にあるときだけ持つ(他の端末・パートナーの写真は
// storagePath から署名付きURLで取得する)。
export interface EveningPhoto {
  id: string;
  recordId: string;
  storagePath: string; // {user_id}/{record_id}/{id}.jpg
  createdAt: string;
}
