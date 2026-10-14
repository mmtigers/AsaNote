import { getSupabaseClient } from "./supabase/client";

export type ClientErrorApp = "asa" | "yoru";
// handled-error は、try/catch で受け止めて画面に出す(または黙って続ける)ことにしたエラーで、場所は context.where で区別する(#213)。
// sync-failure / local-db は、画面側で握りつぶして表示だけしているエラー(同期の失敗・端末DBが使えない)。
export type ClientErrorSource =
  | "error-boundary"
  | "window-error"
  | "unhandled-rejection"
  | "sync-failure"
  | "local-db"
  | "handled-error";
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
type ReportBucket = "unexpected" | "sync" | "local-db" | "handled";
const BUCKET_OF_SOURCE: Record<ClientErrorSource, ReportBucket> = {
  "error-boundary": "unexpected",
  "window-error": "unexpected",
  "unhandled-rejection": "unexpected",
  "sync-failure": "sync",
  "local-db": "local-db",
  "handled-error": "handled",
};
// 1ページの最大は合計 21 件(想定外エラー系は3つの source で10件を共有)。
const MAX_REPORTS_PER_BUCKET: Record<ReportBucket, number> = {
  unexpected: 10,
  sync: 5,
  "local-db": 1,
  handled: 5,
};

const reportedKeys: Record<ReportBucket, Set<string>> = {
  unexpected: new Set(),
  sync: new Set(),
  "local-db": new Set(),
  handled: new Set(),
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

// context が上限を超えたら、全体を捨てずに、優先度の低い項目から落とす(#213)。
// where / phase は切り分けの要なので最後まで残し、次いで online・standalone。それ以外(付帯情報)は後ろの項目から落とす。
const KEEP_FIRST = ["where", "phase", "online", "standalone"];
function fitContext(context: ClientErrorContext): ClientErrorContext | null {
  if (JSON.stringify(context).length <= MAX_CONTEXT) return context;
  const entries = Object.entries(context);
  const rank = (key: string) => {
    const i = KEEP_FIRST.indexOf(key);
    return i === -1 ? KEEP_FIRST.length : i;
  };
  const kept: [string, string | number | boolean | null][] = [];
  // 優先度の高い順(同順位は元の並び)に、収まる限り入れる。
  const sorted = entries.map((e, i) => ({ e, i })).sort((a, b) => rank(a.e[0]) - rank(b.e[0]) || a.i - b.i);
  for (const { e } of sorted) {
    const next = Object.fromEntries([...kept, e]);
    if (JSON.stringify(next).length <= MAX_CONTEXT) kept.push(e);
  }
  return kept.length > 0 ? Object.fromEntries(kept) : null;
}

// 付帯情報の集め方。アプリ固有のもの(未同期の件数など)は、アプリが provider を登録して足す。
// 記録の内容(メモ・タグ)・写真・ファイル名は入れない。件数・時刻・状態の区分だけ。
const EXTRA_CONTEXT_TIMEOUT_MS = 1500;
let contextProvider: (() => Promise<ClientErrorContext>) | null = null;
export function registerClientErrorContextProvider(provider: (() => Promise<ClientErrorContext>) | null): void {
  contextProvider = provider;
}

async function browserContext(): Promise<ClientErrorContext> {
  const extra: ClientErrorContext = {};
  if (typeof navigator !== "undefined") {
    extra.swState = !("serviceWorker" in navigator) ? "unsupported" : navigator.serviceWorker.controller ? "controlled" : "uncontrolled";
    if (typeof navigator.storage?.estimate === "function") {
      const { usage, quota } = await navigator.storage.estimate();
      if (typeof usage === "number") extra.storageUsedMb = Math.round(usage / 1024 / 1024);
      if (typeof quota === "number") extra.storageQuotaMb = Math.round(quota / 1024 / 1024);
    }
  }
  return extra;
}

async function settled(task: () => Promise<ClientErrorContext>): Promise<ClientErrorContext> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task(),
      new Promise<ClientErrorContext>((resolve) => {
        timer = setTimeout(() => resolve({}), EXTRA_CONTEXT_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

async function collectExtraContext(): Promise<ClientErrorContext> {
  const [browser, app] = await Promise.all([settled(browserContext), contextProvider ? settled(contextProvider) : {}]);
  return { ...browser, ...app };
}

// ClientErrorReporter が、どのアプリか・版を覚えておく。core の共通処理(runAction など)が、アプリを知らずに
// reportHandledError を呼べるようにするため。
let registered: { app: ClientErrorApp; appVersion?: string } | null = null;
export function registerClientErrorApp(app: ClientErrorApp, appVersion?: string): void {
  registered = { app, appVersion };
}

// PostgrestError の details には値が入りうるので、handled-error では短く切る。
const MAX_HANDLED_DETAILS = 200;

/**
 * 受け止めて握りつぶしていたエラー(認証・グループ操作など)を client_errors へ送る(#213)。
 * where は場所の区分名(例: "auth/sign-in")。アプリ未登録(ClientErrorReporter が未マウント)なら何もしない。
 */
export function reportHandledError(where: string, error: unknown, context?: ClientErrorContext): void {
  if (!registered) return;
  let safe = error;
  if (typeof error === "object" && error !== null && !(error instanceof Error) && typeof (error as { details?: unknown }).details === "string") {
    safe = { ...(error as object), details: truncate((error as { details: string }).details, MAX_HANDLED_DETAILS) };
  }
  reportClientError(registered.app, "handled-error", safe, registered.appVersion, { where, ...context });
}

/** テスト用: 送信済みの重複判定と上限カウントを初期化する。 */
export function resetClientErrorReports(): void {
  for (const keys of Object.values(reportedKeys)) keys.clear();
  registered = null;
  contextProvider = null;
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
    // handled-error も同じ考え方で、場所(where)が違えば別のエラーとして数える。
    const phaseKey = source === "sync-failure" ? "phase" : source === "handled-error" ? "where" : null;
    const phase = phaseKey && typeof context?.[phaseKey] === "string" ? (context[phaseKey] as string) : "";
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

    // 付帯情報(未同期の件数・Service Worker の状態・ストレージなど)は、送ると決めた時にだけ集める。
    // 非同期で、取れなくても(タイムアウト含め)送信は止めない。優先度が低いので、大きすぎれば先に落とされる。
    void Promise.all([collectExtraContext(), supabase.auth.getSession()])
      .then(([extra, { data }]) =>
        supabase.from("client_errors").insert({
          ...row,
          context: fitContext({ ...baseContext, ...extra }),
          user_id: data.session?.user.id ?? null,
        })
      )
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
