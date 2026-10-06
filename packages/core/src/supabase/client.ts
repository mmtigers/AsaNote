import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

// .env.local が未設定でもビルド/SSRが失敗しないよう、初回利用時まで生成を遅延する。
export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabaseの環境変数が未設定です。.env.local.example を参考に .env.local を作成してください。"
    );
  }

  client = createClient(supabaseUrl, supabaseAnonKey);
  return client;
}
