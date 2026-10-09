// 実Supabase(テスト専用プロジェクト)に対するE2Eの設定読み込みと、本番誤接続のガード(#117)。
//
// **本番のSupabaseには絶対に接続しない。** このE2Eはグループを作り・参加し・抜けるなど、実データを書き換える。
// そのため、設定が揃っていなければ何もせず skip し、揃っていても次のどれかに当たったら例外を投げて中止する。
//   - URLが本番のものと一致する(E2E_PRODUCTION_SUPABASE_URL / シェルや .env.local の NEXT_PUBLIC_SUPABASE_URL)
//   - ダミーURL(placeholder.supabase.co)
//   - anon key が anon ロールのJWTでない(service role key や secret key を渡してしまった場合)
//   - テストユーザーのメールが `asanote-e2e-` で始まらない(実ユーザーの口座で動かさないため)
// このファイルは純粋関数だけを持ち、単体テスト(config.test.ts)で固定している。

/** テストユーザーのメールアドレスのローカル部の接頭辞。これで始まらないアカウントではE2Eを動かさない。 */
export const TEST_USER_EMAIL_PREFIX = "asanote-e2e-";

export const REQUIRED_ENV_NAMES = [
  "E2E_SUPABASE_URL",
  "E2E_SUPABASE_ANON_KEY",
  "E2E_USER_A_EMAIL",
  "E2E_USER_A_PASSWORD",
  "E2E_USER_B_EMAIL",
  "E2E_USER_B_PASSWORD",
] as const;

export interface E2EConfig {
  supabaseUrl: string;
  anonKey: string;
  userA: { email: string; password: string };
  userB: { email: string; password: string };
}

export type E2EConfigResult =
  | { enabled: true; config: E2EConfig }
  | { enabled: false; missing: string[] };

type Env = Record<string, string | undefined>;

export class ProductionGuardError extends Error {
  constructor(message: string) {
    super(`[実SupabaseのE2Eを中止] ${message}`);
    this.name = "ProductionGuardError";
  }
}

/** 末尾のスラッシュ・パス・大文字小文字の違いを無視して比較するための正規化(origin のみ)。 */
export function normalizeOrigin(url: string): string | null {
  try {
    return new URL(url.trim()).origin.toLowerCase();
  } catch {
    return null;
  }
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/** JWTのpayloadを読む(検証はしない。service role key の取り違え検知だけが目的)。 */
function jwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from((parts[1] ?? "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const role = (JSON.parse(json) as { role?: unknown }).role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

/**
 * 接続先として使ってよいかを検査する。使えなければ ProductionGuardError。
 * @param forbiddenUrls 本番のURL(と思われるもの)。1つでも origin が一致したら中止する。
 */
export function assertSafeTarget(config: E2EConfig, forbiddenUrls: string[]): void {
  const origin = normalizeOrigin(config.supabaseUrl);
  if (!origin) throw new ProductionGuardError("E2E_SUPABASE_URL がURLとして解釈できません。");
  const { hostname, protocol } = new URL(origin);

  if (protocol !== "https:" && !isLocalHost(hostname)) {
    throw new ProductionGuardError("E2E_SUPABASE_URL は https(またはローカルのSupabase)である必要があります。");
  }
  if (hostname === "placeholder.supabase.co") {
    throw new ProductionGuardError("E2E_SUPABASE_URL がダミー値(placeholder.supabase.co)です。");
  }

  for (const forbidden of forbiddenUrls) {
    if (normalizeOrigin(forbidden) === origin) {
      throw new ProductionGuardError(
        "E2E_SUPABASE_URL が本番のSupabaseと一致しました。テスト専用の別プロジェクトのURLを指定してください。",
      );
    }
  }

  if (config.anonKey.startsWith("sb_secret_") || jwtRole(config.anonKey) === "service_role") {
    throw new ProductionGuardError(
      "E2E_SUPABASE_ANON_KEY に service role / secret key が渡されています。anon(publishable)key を指定してください。",
    );
  }

  for (const [label, user] of [
    ["E2E_USER_A_EMAIL", config.userA],
    ["E2E_USER_B_EMAIL", config.userB],
  ] as const) {
    const local = user.email.split("@")[0] ?? "";
    if (!local.toLowerCase().startsWith(TEST_USER_EMAIL_PREFIX)) {
      throw new ProductionGuardError(
        `${label} は「${TEST_USER_EMAIL_PREFIX}」で始まるテスト専用アカウントにしてください(実ユーザーでは動かしません)。`,
      );
    }
  }
  if (config.userA.email.toLowerCase() === config.userB.email.toLowerCase()) {
    throw new ProductionGuardError("ユーザーAとBには別のアカウントを指定してください。");
  }
}

/** 本番URLの候補を環境変数から集める(E2E_PRODUCTION_SUPABASE_URL はカンマ区切りで複数可)。 */
export function collectForbiddenUrls(env: Env, extra: string[] = []): string[] {
  const fromEnv = (env.E2E_PRODUCTION_SUPABASE_URL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const publicUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  return [...fromEnv, ...(publicUrl ? [publicUrl] : []), ...extra];
}

/**
 * 環境変数から設定を読む。
 * - 必須の変数が1つでも欠けていれば `{ enabled: false }`(呼び出し側が skip する)。
 * - 揃っていて接続先が危険なら ProductionGuardError を投げる(skip ではなく中止=失敗)。
 */
export function loadE2EConfig(env: Env, extraForbiddenUrls: string[] = []): E2EConfigResult {
  const missing = REQUIRED_ENV_NAMES.filter((name) => !env[name]?.trim());
  if (missing.length > 0) return { enabled: false, missing };

  const config: E2EConfig = {
    supabaseUrl: (env.E2E_SUPABASE_URL ?? "").trim(),
    anonKey: (env.E2E_SUPABASE_ANON_KEY ?? "").trim(),
    userA: { email: (env.E2E_USER_A_EMAIL ?? "").trim(), password: env.E2E_USER_A_PASSWORD ?? "" },
    userB: { email: (env.E2E_USER_B_EMAIL ?? "").trim(), password: env.E2E_USER_B_PASSWORD ?? "" },
  };
  assertSafeTarget(config, collectForbiddenUrls(env, extraForbiddenUrls));
  return { enabled: true, config };
}

/** supabase-js が localStorage にセッションを保存するキー(`sb-<プロジェクトref>-auth-token`)。 */
export function authStorageKey(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
}
