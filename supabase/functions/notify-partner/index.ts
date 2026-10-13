// パートナーがきろくを新規に記入したときのPush通知。
//
// recordsのトリガー(supabase/partner-notify-trigger.sql)が、outcome入りの記録が
// 新規にできた時(INSERT、またはUPDATEでoutcomeがnull→値になった時)にこのEdge Functionを
// 呼び出す(Authorization: Bearer <service_role key> は Supabase の入口の JWT 検証を通すため。呼び出し元の
// 確認は、別ヘッダ x-notify-secret の合言葉(PARTNER_NOTIFY_SECRET)で行う。body: { user_id, record_id })。
// 編集(outcomeが既に入っている記録の更新)ではトリガーが発火しないため通知しない。
// 環境変数は send-reminders と同じ(VAPID_* を `supabase secrets set` で設定済みであること)に加え、
// PARTNER_NOTIFY_SECRET(16文字以上。send-reminders の CRON_SECRET とは別の値にする)。
//
// 処理の流れ:
//   1. 記録した人(user_id)と同じグループの、本人以外のメンバーを探す。
//   2. そのうち notification_settings.notify_partner_record=true のメンバーの全購読へ送る。
//   3. 通知文言の「〇〇さん」は記録した人のメールアドレスの@より前(表示名を持たないための割り切り)。
//      送信に失敗した購読(410/404)はその場で削除する。
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import webpush from "npm:web-push@3.6.7";
import { isAuthorizedSecret } from "../_shared/pushLogic.ts";
import { runPartnerNotify, type PartnerDb } from "../_shared/partnerHandler.ts";

// 処理の本体は _shared/partnerHandler.ts(テストあり)。ここは環境変数・合言葉・リクエストの読み取りと、
// 本物のクライアントの組み立てだけ。
const json = (body: unknown, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: typeof body === "string" ? undefined : { "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT");

  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return new Response("必要な環境変数(VAPID_*)が未設定です。docs/push-notifications-setup.mdを参照してください。", {
      status: 500,
    });
  }

  // 呼び出せるのはトリガーだけ。他ユーザーのなりすましで通知を送れないようにする。Supabase の JWT 検証は
  // 公開の anon キーでも通すため、トリガー専用の合言葉(`x-notify-secret` ヘッダ。`supabase secrets set
  // PARTNER_NOTIFY_SECRET=...` で設定)を確かめる。`SUPABASE_SERVICE_ROLE_KEY` との一致は使わない
  // (非推奨で、値がダッシュボードの鍵と同じとは限らない。send-reminders で、正しい鍵でも 401 になった)。
  if (!Deno.env.get("PARTNER_NOTIFY_SECRET")) {
    return new Response("PARTNER_NOTIFY_SECRET が未設定です。docs/push-notifications-setup.mdを参照してください。", {
      status: 500,
    });
  }
  if (!isAuthorizedSecret(req.headers.get("x-notify-secret"), Deno.env.get("PARTNER_NOTIFY_SECRET"))) {
    return new Response("unauthorized", { status: 401 });
  }

  let authorId: string | undefined;
  try {
    authorId = ((await req.json()) as { user_id?: string }).user_id;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  if (!authorId) return new Response("user_id is required", { status: 400 });

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const result = await runPartnerNotify(
    supabase as unknown as PartnerDb,
    (subscription, payload) => webpush.sendNotification(subscription, payload),
    authorId,
    async (userId) => {
      // 記録した人のメール(通知文言の「〇〇さん」用)。取れなくても通知は送る(名前なしの文言になる)。
      const { data: author } = await supabase.auth.admin.getUserById(userId);
      return author?.user?.email;
    }
  );
  return json(result.body, result.status);
});
