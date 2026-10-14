import { expect, test, type Page } from "@playwright/test";

// CSP(#197)。強制(Content-Security-Policy。違反をブロックする)で配っている。
// 強制でも Report-Only でも、ブラウザは違反のたびに securitypolicyviolation を発火するので、通常の操作で
// 違反が1件も出ないことを確かめる。Report-Only に戻すときは、next.config.ts のキーと、下の ENFORCED を変える。
// ビルド時の NEXT_PUBLIC_SUPABASE_URL(E2E では placeholder)が接続先として許可される。
const SUPABASE_ORIGIN = "https://placeholder.supabase.co";
const ENFORCED = true;

// ページ内で起きた CSP 違反(securitypolicyviolation)を集める。
async function collectViolations(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __cspViolations: string[] }).__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { __cspViolations: string[] }).__cspViolations.push(
        `${event.violatedDirective}: ${event.blockedURI}`
      );
    });
  });
  return () =>
    page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);
}

test("CSP ヘッダが付いている(強制。違反はブロックされる)", async ({ request }) => {
  const headers = (await request.get("/")).headers();
  const enforced = headers["content-security-policy"];
  const reportOnly = headers["content-security-policy-report-only"];
  const csp = ENFORCED ? enforced : reportOnly;
  expect(csp).toBeTruthy();
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain(SUPABASE_ORIGIN);
  // 段階を取り違えない(強制の段階では、Report-Only のヘッダを付けない)。
  expect(ENFORCED ? reportOnly : enforced).toBeFalsy();
});

test("通常の操作(記録・一覧・各ページ)で CSP 違反が1件も出ない", async ({ page }) => {
  const violations = await collectViolations(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  // 水和(インラインscript)・フォント・manifest・サービスワーカーまで一通り動く。
  await page.getByRole("button", { name: "今日の様子を記録する" }).click();
  await page.getByRole("button", { name: /スムーズ/ }).click();
  await page.getByLabel("メモ欄").fill("CSPの確認");
  await page.getByRole("button", { name: "この日の記録を保存する" }).click();
  // 起床時刻が未入力のため保存前の確認が出る(日曜・祝日でも同じ確認にまとまる)。
  await page.getByRole("button", { name: "このまま保存する" }).click();
  await expect(page.getByRole("button", { name: "記録を編集する" })).toBeVisible();

  // 全ページを開く(ログイン前でも開ける画面)。
  for (const path of ["/timeline", "/stats", "/export", "/group", "/updates", "/login"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state);

  expect(await violations()).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("許可していない接続先は、CSP 違反として検出される(方針が効いている確認)", async ({ page }) => {
  const violations = await collectViolations(page);
  await page.goto("/");

  await page.evaluate(async (target) => {
    try {
      await fetch(target, { mode: "no-cors" });
    } catch {
      // 強制のときはブロックされて失敗する。Report-Only のときは送信されうる(通信先は存在しなくてよい)。
    }
  }, "https://attacker.example/steal");

  // Report-Only では、同じ違反が URL 全体・オリジンの両方の表記で報告されることがある。件数ではなく中身を見る。
  const attacker = await violations();
  expect(attacker.length).toBeGreaterThan(0);
  expect(attacker.every((v) => v.startsWith("connect-src: https://attacker.example"))).toBe(true);

  // Supabase の接続先: 許可されているので、違反にならない。
  await page.evaluate(async (target) => {
    try {
      await fetch(target, { mode: "no-cors" });
    } catch {
      // この環境からは出られず失敗してよい。
    }
  }, `${SUPABASE_ORIGIN}/rest/v1/`);
  expect((await violations()).filter((v) => v.includes("placeholder.supabase.co"))).toEqual([]);
});
