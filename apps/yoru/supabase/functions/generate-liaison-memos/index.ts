// 連絡メモの下書きを、記録から AI(Claude API)で作る(仕様 apps/yoru/docs/liaison-memo.md)。
//
// 呼び出し方は2つ:
//   1. pg_cron(10分ごと。supabase/cron-liaison-memos.sql): x-cron-secret ヘッダの合言葉(EVENING_CRON_SECRET。
//      send-evening-reminders と同じ値)で確かめ、予定の時刻を過ぎた子どもの下書きを作って、Push で知らせる。
//   2. 画面(/memo の「今すぐ作る」「作り直す」): ログイン中の人の JWT(Authorization: Bearer)で確かめ、
//      body の { child_id, instruction? } の下書きを作る。通知は送らない。
//
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は Supabase が自動で注入する。以下は `supabase secrets set` で設定する:
//   ANTHROPIC_API_KEY(Claude API のキー)
//   LIAISON_MEMO_MODEL(任意。既定は DEFAULT_MODEL)
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT / EVENING_CRON_SECRET(よるノートのリマインドで設定済み)
// 手順は docs/push-notifications-setup.md を参照。
//
// 処理の本体は _shared/liaisonHandler.ts(テストあり)。ここは環境変数・認証と、本物のクライアントの組み立てだけ。
// ログに記録の中身・下書きの本文を出さない(子どもの情報のため)。
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import webpush from "npm:web-push@3.6.7";
import { type Generate, LiaisonError, runAuto, runManual } from "../_shared/liaisonHandler.ts";
import { OUTPUT_SCHEMA } from "../_shared/liaisonPrompt.ts";
import { createLiaisonStore } from "../_shared/liaisonStore.ts";
import { isAuthorizedSecret } from "../_shared/pushLogic.ts";

const DEFAULT_MODEL = "claude-opus-5-5";
// サーバー側の代替(安全のための断りのとき、別のモデルで作り直す)に対応するモデル。ほかのモデルでは付けない。
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-2", "claude-fable-5-1", "claude-sonnet-5-5"]);

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "content-type": "application/json" } });

function makeGenerate(apiKey: string, model: string): Generate {
  // 関数の実行時間の上限に収めるため、1回の待ち時間と再試行を短めにする。
  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
  return async ({ system, messages }) => {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      system,
      messages,
      // 短い要約なので、考える量は少なくてよい。
      output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      ...(FALLBACK_MODELS.has(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    if (response.stop_reason === "refusal") throw new LiaisonError("この週の記録からは下書きを作れませんでした");
    if (response.stop_reason === "max_tokens") throw new LiaisonError("下書きが長くなりすぎました。もう一度お試しください");
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { text: string }).text)
      .join("");
    let output: unknown = null;
    try {
      output = JSON.parse(text);
    } catch {
      output = null;
    }
    return { output, model: response.model };
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");
  if (!supabaseUrl || !serviceRoleKey || !apiKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    console.error("generate-liaison-memos: 必要な環境変数が未設定です(docs/push-notifications-setup.md)");
    return json({ error: "not_configured" }, 500);
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const db = createClient(supabaseUrl, serviceRoleKey);
  const deps = {
    store: createLiaisonStore(db),
    generate: makeGenerate(apiKey, Deno.env.get("LIAISON_MEMO_MODEL") || DEFAULT_MODEL),
    send: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) =>
      webpush.sendNotification(subscription, payload),
  };

  // 1. cron。合言葉の無い呼び出しは、画面からの呼び出しとして扱う(下)。
  const cronSecret = request.headers.get("x-cron-secret");
  if (cronSecret !== null) {
    if (!isAuthorizedSecret(cronSecret, Deno.env.get("EVENING_CRON_SECRET"))) return json({ error: "unauthorized" }, 401);
    return json(await runAuto(deps, new Date()));
  }

  // 2. 画面から。ログイン中の人だけ。
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const { data: auth, error: authError } = token ? await db.auth.getUser(token) : { data: null, error: true };
  const userId = auth?.user?.id;
  if (authError || !userId) return json({ error: "unauthorized" }, 401);

  let body: { child_id?: unknown; instruction?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  if (typeof body.child_id !== "string") return json({ error: "bad_request" }, 400);
  const instruction = typeof body.instruction === "string" ? body.instruction : null;

  const result = await runManual(deps, new Date(), userId, body.child_id, instruction);
  if (result.ok) return json(result);
  const status = { not_found: 404, not_enabled: 409, limit: 429, busy: 409, failed: 502 }[result.code];
  return json(result, status);
});
