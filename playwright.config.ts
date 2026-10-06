import { defineConfig, devices } from "@playwright/test";

// 画面をまたぐ動きの自動テスト(e2e/)。Supabase の環境変数を渡さずにビルドしたアプリを起動するので、
// ログイン無し(この端末の IndexedDB だけで動く)の使い方を確かめる。実DB・同期は対象外(Issue #12 の実機確認)。
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // iPhone 相当の幅。片手操作のスマホ前提のアプリなので、実機に近い画面で確かめる。
    ...devices["Pixel 7"],
    // ローカルでは事前インストール済みの Chromium を使う(CI では playwright install で入れる)。
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
