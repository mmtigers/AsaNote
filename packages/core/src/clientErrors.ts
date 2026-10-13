import { getSupabaseClient } from "./supabase/client";

export type ClientErrorApp = "asa" | "yoru";
// sync-failure / local-db は、画面側で握りつぶして表示だけしているエラー(同期の失敗・端末DBが使えない)。
export type ClientErrorSource =
  | "error-boundary"
  | "window-error"
  | "unhandled-rejection"
  | "sync-failure"
  | "local-db";
/** 調査用の付帯情報。記録の内容(メモ・タグなど)は入れない。 */
export type ClientErrorContext = Record<string, string | number | boolean | null>;

// schema.sql の client_errors の check 制約と合わせる(超えると insert が丸ごと失敗する)。
const MAX_MESSAGE = 1000;
const MAX_STACK = 8000;
const MAX_USER_AGENT = 500;
const MAX_CONTEXT = 2000;
// 1回のページ読み込みで送る上限。無限ループするエラーでDBや回線を埋めないための歯止め。
// 同期はオンライン復帰・画面復帰のたびに繰り返し走り、失敗の原因ごとに文言も変わる。同じ枠を共有すると、
// 同期失敗で使い切ってしまい、あとから起きた本当の想定外エラーが送られなくなるため、枠を分ける(#214)。
type ReportBucket = "unexpected" | "sync" | "local-db";
const BUCKET_OF_SOURCE: Record<ClientErrorSource, ReportBucket> = {
  "error-boundary": "unexpected",
  "window-error": "unexpected",
  "unhandled-rejection": "unexpected",
  "sync-failure": "sync",
  "local-db": "local-db",
};
// 1ページの最大は合計 16 件(想定外エラー系は3つの source で10件を共有)。
const MAX_REPORTS_PER_BUCKET: Record<ReportBucket, number> = {
  unexpected: 10,
  sync: 5,
  "local-db": 1,
};

const reportedKeys: Record<ReportBucket, Set<string>> = {
  unexpected: new Set(),
  sync: new Set(),
  "local-db": new Set(),
};

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function describe(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) {
    return { message: error.message || error.name, stack: error.stack ?? null };
  }
  if (typeof error === "string") return { message: error, stack: null };
  // Supabase の PostgrestError などは Error ではないが、message と code を持つ。
  if (typeof error === "object" && error !== null && typeof (error as { message?: unknown }).message === "string") {
    const { message, code, details, hint } = error as { message: string; code?: unknown; details?: unknown; hint?: unknown };
    const extra = [code, details, hint].filter((v): v is string => typeof v === "string" && v !== "");
    return { message: [message, ...extra].join(" | "), stack: null };
  }
  try {
    return { message: JSON.stringify(error) ?? String(error), stack: null };
  } catch {
    return { message: String(error), stack: null };
  }
}

/** テスト用: 送信済みの重複判定と上限カウントを初期化する。 */
export function resetClientErrorReports(): void {
  for (const keys of Object.values(reportedKeys)) keys.clear();
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
  appVersion?: string,
  context?: ClientErrorContext
): void {
  try {
    const { message, stack } = describe(error);
    // 同じエラーの連投(再レンダーごとの再送など)は1回にする。
    // 同期失敗は、同じ文言でも失敗した段階(phase)が違えば原因の切り分けに役立つので、別のエラーとして数える。
    const phase = source === "sync-failure" && typeof context?.phase === "string" ? context.phase : "";
    const key = `${source}:${phase}:${message}:${stack?.slice(0, 200) ?? ""}`;
    const bucket = BUCKET_OF_SOURCE[source];
    const keys = reportedKeys[bucket];
    if (keys.has(key) || keys.size >= MAX_REPORTS_PER_BUCKET[bucket]) return;
    keys.add(key);

    const supabase = getSupabaseClient();
    const baseContext: ClientErrorContext = {
      online: typeof navigator !== "undefined" ? navigator.onLine : null,
      standalone: typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(display-mode: standalone)").matches : null,
      ...context,
    };
    const contextJson = JSON.stringify(baseContext);
    const row = {
      context: contextJson.length <= MAX_CONTEXT ? baseContext : null,
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
