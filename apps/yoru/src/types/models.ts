import type { DinnerState, MilestoneKey, Outcome, ResponseEffect } from "@/constants/choices";

// グループ・子どもは「共通表」で、あさノートと共有する(docs/SPEC.md §7)。
// 定義の正はあさノート側の supabase/schema.sql。ここの型はそのうち画面が使う列だけを写している。

// 記録を共有する単位(夫婦・家族を想定)。1ユーザーは同時に1グループのみ所属可能。
export interface Group {
  id: string;
  name: string | null;
  created_by: string;
  created_at: string;
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

// 複数の子ども対応。groups同様、作成者+同じグループのメンバーが共有する。
export interface Child {
  id: string;
  created_by: string;
  name: string;
  created_at: string;
}

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
