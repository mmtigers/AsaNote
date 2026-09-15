import type { Outcome } from "@/constants/choices";

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

// 場所・訪問記録を共有する単位(夫婦・家族を想定)。1ユーザーは同時に1グループのみ所属可能。
export interface Group {
  id: string;
  name: string | null;
  created_by: string;
  created_at: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  joined_at: string;
}

// グループ設定画面でのメンバー表示用。auth.usersのemailはSECURITY DEFINER関数
// (get_group_members)経由でのみ取得できる。
export interface GroupMemberProfile {
  user_id: string;
  email: string | null;
  joined_at: string;
}

export interface GroupInvite {
  id: string;
  group_id: string;
  code: string;
  created_by: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  created_at: string;
}

// 複数の子ども対応(#3)。groups同様、作成者+同じグループのメンバーが共有する。
export interface Child {
  id: string;
  created_by: string;
  name: string;
  created_at: string;
}
