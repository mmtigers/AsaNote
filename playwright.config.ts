import { defineConfig, devices } from "@playwright/test";

// このアプリはSupabase未接続でも(ログインしなくても)端末内で完結して動くため、
// E2E(ログイン不要な範囲)ではダミー値で十分。実際のSupabaseには接続しない。
// グループ作成・招待コード参加などログインが前提のE2Eは別Issueで検討する。
const PLACEHOLDER_SUPABASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-anon-key",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: PLACEHOLDER_SUPABASE_ENV,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
