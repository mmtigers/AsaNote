import { defineConfig, devices } from "@playwright/test";
import { loadE2EConfigFromProcess } from "./e2e-supabase/env";

// 実Supabase(テスト専用プロジェクト)に対するE2E用の設定(#117)。通常の playwright.config.ts とは別物で、
// `npm run test:e2e:supabase` でだけ動く(通常の `npm run test:e2e` と CI の e2e-test ジョブには影響しない)。
//
// E2E_SUPABASE_URL などが未設定なら、dev サーバーも起動せず、テストは自動で skip される。
// 設定されていて接続先が本番と一致する等の危険があれば、ここで例外になり中止する(e2e-supabase/config.ts)。
// 詳細な準備手順は docs/e2e-supabase.md。

const loaded = loadE2EConfigFromProcess();

if (!loaded.enabled) {
  console.warn(
    `[e2e-supabase] 実SupabaseのE2Eはスキップされます(未設定: ${loaded.missing.join(", ")})。` +
      " 準備は apps/asa/docs/e2e-supabase.md を参照。",
  );
}

// 通常のE2E(3000番)と衝突しないよう別ポートにする。
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e-supabase",
  testMatch: /.*\.spec\.ts/,
  // 2人のテストユーザーを共有するため、並列にしない。
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "html",
  outputDir: "./test-results-supabase",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // トレースはlocalStorage(=ログイン済みセッションのトークン)を含むため、成果物に残さない。
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: loaded.enabled
    ? {
        command: `npx next dev -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: loaded.config.supabaseUrl,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: loaded.config.anonKey,
        },
      }
    : undefined,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
