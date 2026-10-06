// グループ・子どもは「共通表」で、あさノート・よるノートが同じ Supabase プロジェクトで共有する(よるノートの docs/SPEC.md §7)。
// 定義の正はあさノート側の supabase/schema.sql。ここの型はそのうち画面が使う列だけを写している。

// 記録を共有する単位(夫婦・家族を想定)。1ユーザーは同時に1グループのみ所属可能。
// (グループ共有の仕組み自体は別アプリ Matane と同型。詳細は supabase/schema.sql のコメント)
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

// 複数の子ども対応(#3)。groups同様、作成者+同じグループのメンバーが共有する。
export interface Child {
  id: string;
  created_by: string;
  name: string;
  created_at: string;
}
