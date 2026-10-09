// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assertSafeTarget,
  authStorageKey,
  loadE2EConfig,
  ProductionGuardError,
  REQUIRED_ENV_NAMES,
  type E2EConfig,
} from "./config";

function jwt(role: string): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256" })}.${enc({ role })}.sig`;
}

const TEST_URL = "https://abcdefgh.supabase.co";
const PROD_URL = "https://prodprodprod.supabase.co";

function baseEnv(): Record<string, string> {
  return {
    E2E_SUPABASE_URL: TEST_URL,
    E2E_SUPABASE_ANON_KEY: jwt("anon"),
    E2E_USER_A_EMAIL: "asanote-e2e-a@example.com",
    E2E_USER_A_PASSWORD: "pw-a",
    E2E_USER_B_EMAIL: "asanote-e2e-b@example.com",
    E2E_USER_B_PASSWORD: "pw-b",
  };
}

describe("loadE2EConfig", () => {
  it("必須の変数が全て無ければ enabled:false(skip)で、例外は投げない", () => {
    expect(loadE2EConfig({})).toEqual({ enabled: false, missing: [...REQUIRED_ENV_NAMES] });
  });

  it("1つでも欠けていれば enabled:false で、欠けた名前を返す", () => {
    const env = baseEnv();
    delete env.E2E_USER_B_PASSWORD;
    expect(loadE2EConfig(env)).toEqual({ enabled: false, missing: ["E2E_USER_B_PASSWORD"] });
  });

  it("空白だけの値は未設定として扱う", () => {
    const env = { ...baseEnv(), E2E_SUPABASE_URL: "  " };
    expect(loadE2EConfig(env)).toEqual({ enabled: false, missing: ["E2E_SUPABASE_URL"] });
  });

  it("全て揃い、安全なら enabled:true", () => {
    expect(loadE2EConfig(baseEnv()).enabled).toBe(true);
  });
});

describe("本番誤接続のガード", () => {
  const config = (): E2EConfig => ({
    supabaseUrl: TEST_URL,
    anonKey: jwt("anon"),
    userA: { email: "asanote-e2e-a@example.com", password: "x" },
    userB: { email: "asanote-e2e-b@example.com", password: "x" },
  });

  it("本番URLと一致したら中止する(末尾スラッシュ・大文字小文字・パスの違いは無視)", () => {
    const c = { ...config(), supabaseUrl: "https://ProdProdProd.supabase.co/" };
    expect(() => assertSafeTarget(c, [PROD_URL])).toThrow(ProductionGuardError);
  });

  it("E2E_PRODUCTION_SUPABASE_URL(カンマ区切り)と、シェルの NEXT_PUBLIC_SUPABASE_URL の両方を本番候補として扱う", () => {
    const a = {
      ...baseEnv(),
      E2E_SUPABASE_URL: PROD_URL,
      E2E_PRODUCTION_SUPABASE_URL: `https://x.supabase.co, ${PROD_URL}`,
    };
    expect(() => loadE2EConfig(a)).toThrow(ProductionGuardError);
    const b = { ...baseEnv(), E2E_SUPABASE_URL: PROD_URL, NEXT_PUBLIC_SUPABASE_URL: PROD_URL };
    expect(() => loadE2EConfig(b)).toThrow(ProductionGuardError);
  });

  it("追加の禁止URL(.env.local の値など)とも照合する", () => {
    expect(() => loadE2EConfig(baseEnv(), [TEST_URL])).toThrow(ProductionGuardError);
  });

  it("ダミーURLと、https でないURLは中止する(ローカルのSupabaseは http でも可)", () => {
    expect(() => assertSafeTarget({ ...config(), supabaseUrl: "https://placeholder.supabase.co" }, [])).toThrow(
      ProductionGuardError,
    );
    expect(() => assertSafeTarget({ ...config(), supabaseUrl: "http://example.com" }, [])).toThrow(
      ProductionGuardError,
    );
    expect(() => assertSafeTarget({ ...config(), supabaseUrl: "not a url" }, [])).toThrow(ProductionGuardError);
    expect(() => assertSafeTarget({ ...config(), supabaseUrl: "http://127.0.0.1:54321" }, [])).not.toThrow();
  });

  it("anon key の代わりに service role / secret key を渡したら中止する", () => {
    expect(() => assertSafeTarget({ ...config(), anonKey: jwt("service_role") }, [])).toThrow(ProductionGuardError);
    expect(() => assertSafeTarget({ ...config(), anonKey: "sb_secret_abc" }, [])).toThrow(ProductionGuardError);
    expect(() => assertSafeTarget({ ...config(), anonKey: "sb_publishable_abc" }, [])).not.toThrow();
  });

  it("テストユーザーのメールが接頭辞で始まらなければ中止する", () => {
    const c = { ...config(), userA: { email: "real-user@example.com", password: "x" } };
    expect(() => assertSafeTarget(c, [])).toThrow(ProductionGuardError);
  });

  it("AとBが同じアカウントなら中止する", () => {
    const c = { ...config(), userB: { email: "ASANOTE-E2E-A@example.com", password: "x" } };
    expect(() => assertSafeTarget(c, [])).toThrow(ProductionGuardError);
  });
});

describe("authStorageKey", () => {
  it("supabase-js の保存キー(sb-<ref>-auth-token)を返す", () => {
    expect(authStorageKey(TEST_URL)).toBe("sb-abcdefgh-auth-token");
    expect(authStorageKey("http://localhost:54321")).toBe("sb-localhost-auth-token");
  });
});
