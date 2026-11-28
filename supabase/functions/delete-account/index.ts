// 退会(アカウントとデータの削除。#290)。画面(あさノート・よるノートの「共有」→「退会」)から、
// ログイン中の人の JWT(Authorization: Bearer)で呼ぶ。本人のアカウントだけを消す(ほかの人は指定できない)。
// body: { confirm: "退会する" }(誤って呼ばれても消さないよう、画面で入力した確認の文言をサーバーでも確かめる)。
//
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は Supabase が自動で注入する。追加の secrets は要らない。
// デプロイは手動(apps/asa/docs/push-notifications-setup.md の「退会」)。
//
// 処理の本体は _shared/deleteAccountHandler.ts(テストあり)。ここは環境変数・認証と、本物のクライアントの組み立てだけ。
// ログに個人の情報(ID・メールアドレス)を出さない。
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { type DeleteAccountStore, runDeleteAccount } from "../_shared/deleteAccountHandler.ts";

const PHOTO_BUCKET = "evening-photos";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "content-type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("delete-account: 必要な環境変数が未設定です");
    return json({ error: "not_configured" }, 500);
  }
  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // ログイン中の本人だけ。消すのは、トークンから分かる本人のアカウント(body の値では選ばない)。
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const { data: auth, error: authError } = token ? await db.auth.getUser(token) : { data: null, error: true };
  const userId = auth?.user?.id;
  if (authError || !userId) return json({ error: "unauthorized" }, 401);

  let body: { confirm?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const store: DeleteAccountStore = {
    photoPaths: async (id) => {
      const { data, error } = await db.from("evening_photos").select("storage_path").eq("user_id", id);
      if (error) throw error;
      return (data ?? []).map((row) => String(row.storage_path)).filter(Boolean);
    },
    removePhotos: async (paths) => {
      const { error } = await db.storage.from(PHOTO_BUCKET).remove(paths);
      if (error) throw error;
    },
    leaveGroup: async (id) => {
      const { error } = await db.from("group_members").delete().eq("user_id", id);
      if (error) throw error;
    },
    deleteUser: async (id) => {
      const { error } = await db.auth.admin.deleteUser(id);
      if (error) throw error;
    },
  };

  const result = await runDeleteAccount(store, userId, body.confirm);
  if (result.ok) return json(result);
  return json(result, result.code === "bad_request" ? 400 : 500);
});
