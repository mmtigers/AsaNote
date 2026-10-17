import { describeErrorDetail, isNetworkError, NETWORK_ERROR_MESSAGE_JA } from "@note/core/errors";

// サーバー(DB の関数・Supabase Auth)が返すエラーを、利用者向けの日本語にする。
// DB の関数は `raise exception 'invite_invalid'` のように、決まった語をメッセージにして返す(supabase/schema.sql)。
const KNOWN_MESSAGES: Record<string, string> = {
  invite_invalid: "招待コードが正しくないか、有効期限(24時間)が切れています。家族管理者に新しいコードを発行してもらってください。",
  already_in_family: "すでに家族に参加しています。",
  not_admin: "この操作は家族管理者だけができます。",
  last_admin: "家族管理者が誰もいなくなるため、この操作はできません。先に、ほかの人を家族管理者にしてください。",
  member_not_found: "そのメンバーは見つかりませんでした。画面を開き直してください。",
  not_authenticated: "ログインが切れました。もう一度ログインしてください。",
  // 記録(oya_records のトリガー・complete_oya_record)。
  future_date: "未来の日付には記録できません。",
  not_a_parent: "記録できるのは、親(記録する人)だけです。",
  record_not_found: "先に記録を保存してください。",
  // Supabase Auth: コードの誤り・期限切れ。
  otp_expired: "コードが正しくないか、有効期限が切れています。もう一度コードを送ってください。",
  // 呼び名の長さ(check 制約)。
  display_name_check: "呼び名は1〜20文字で入力してください。",
};

export function describeServerError(error: unknown, fallback: string): string {
  if (isNetworkError(error)) return NETWORK_ERROR_MESSAGE_JA;
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  if (code && KNOWN_MESSAGES[code]) return KNOWN_MESSAGES[code];
  const detail = describeErrorDetail(error) ?? "";
  for (const [key, message] of Object.entries(KNOWN_MESSAGES)) {
    if (detail.includes(key)) return message;
  }
  if (/token has expired or is invalid/i.test(detail)) return KNOWN_MESSAGES.otp_expired!;
  return fallback;
}
