import { getSupabaseClient } from "./supabase/client";

export type ClientErrorApp = "asa" | "yoru";
export type ClientErrorSource = "error-boundary" | "window-error" | "unhandled-rejection";

// schema.sql の client_errors の check 制約と合わせる(超えると insert が丸ごと失敗する)。
const MAX_MESSAGE = 1000;
const MAX_STACK = 8000;
const MAX_USER_AGENT = 500;
// 1回のページ読み込みで送る上限。無限ループするエラーでDBや回線を埋めないための歯止め。
const MAX_REPORTS_PER_PAGE = 10;

const reportedKeys = new Set<string>();

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function describe(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    return { message: error.message || error.name, stack: error.stack ?? null };
  }
  if (typeof error === "string") return { message: error, stack: null };
  try {
    return { message: JSON.stringify(error) ?? String(error), stack: null };
  } catch {
    return { message: String(error), stack: null };
  }
}

/** テスト用: 送信済みの重複判定と上限カウントを初期化する。 */
export function resetClientErrorReports(): void {
  reportedKeys.clear();
}

/**
 * ブラウザで起きた想定外のエラーを client_errors へ送る(fire-and-forget)。
 * 送信に失敗しても、呼び出し元(エラー画面や window のハンドラ)を壊さない。
 *
 * メモ・タグなどの記録内容は送らない。送るのは、エラーの文言・スタック・画面のパス(クエリは除く)・
 * UA・アプリの版・ログイン中ならユーザーID のみ。
 */
export function reportClientError(
  app: ClientErrorApp,
  source: ClientErrorSource,
  error: unknown,
  appVersion?: string
): void {
  try {
    const { message, stack } = describe(error);
    // 同じエラーの連投(再レンダーごとの再送など)は1回にする。
    const key = `${source}:${message}:${stack?.slice(0, 200) ?? ""}`;
    if (reportedKeys.has(key) || reportedKeys.size >= MAX_REPORTS_PER_PAGE) return;
    reportedKeys.add(key);

    const supabase = getSupabaseClient();
    const row = {
      app,
      source,
      message: truncate(message, MAX_MESSAGE),
      stack: stack ? truncate(stack, MAX_STACK) : null,
      path: typeof location !== "undefined" ? location.pathname : null,
      user_agent: typeof navigator !== "undefined" ? truncate(navigator.userAgent, MAX_USER_AGENT) : null,
      app_version: appVersion ?? null,
      client_ts: new Date().toISOString(),
    };

    void supabase.auth
      .getSession()
      .then(({ data }) => supabase.from("client_errors").insert({ ...row, user_id: data.session?.user.id ?? null }))
      .then(
        ({ error: insertError }) => {
          // ここで console.error すると、送信失敗が再び error として拾われかねないので warn に留める。
          if (insertError) console.warn("client error report failed", insertError);
        },
        (reason: unknown) => {
          console.warn("client error report failed", reason);
        }
      );
  } catch (reportError) {
    console.warn("client error report failed", reportError);
  }
}
