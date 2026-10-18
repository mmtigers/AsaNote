import { defineConfig, devices } from "@playwright/test";

// 画面をまたぐ動きの自動テスト(e2e/)。土台の段階では Supabase に接続しないので、
// ビルドしたアプリを起動して、画面・ヘッダ・PWA の配信を確かめる。
const PORT = 3200;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // スマホでの利用を優先するアプリなので、実機に近い画面で確かめる。
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
