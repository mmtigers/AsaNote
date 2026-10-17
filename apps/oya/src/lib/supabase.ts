import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@note/core/supabase/client";
import type { Database } from "@/lib/db/database.types";

// 接続は @note/core のクライアント(環境変数 NEXT_PUBLIC_SUPABASE_URL / ANON_KEY。おやノートでは専用のプロジェクトの値)。
// ここでは型だけを付ける。表名・列名・RPC 名の打ち間違いを、型検査で見つけるため。
export function db(): SupabaseClient<Database> {
  return getSupabaseClient() as unknown as SupabaseClient<Database>;
}
