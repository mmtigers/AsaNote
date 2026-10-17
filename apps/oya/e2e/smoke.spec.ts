import { expect, test, type Page } from "@playwright/test";

// 土台の段階(Supabase に未接続)の本番ビルドで、画面・セキュリティヘッダ・PWA の配信を確かめる。
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
  return () => page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);
}

test("CSP などのセキュリティヘッダが付いている", async ({ request }) => {
  const headers = (await request.get("/")).headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toContain(SUPABASE_ORIGIN);
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
});

test("ホーム・更新履歴・404 が表示でき、CSP に弾かれるものが無い", async ({ page }) => {
  const violations = await collectViolations(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "おやノート" })).toBeVisible();
  // 水和・フォント・manifest・サービスワーカーまで一通り動く。
  expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state)).toBeTruthy();

  await page.getByRole("link", { name: /更新履歴/ }).click();
  await expect(page.getByRole("heading", { name: "更新履歴" })).toBeVisible();

  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible();

  expect(await violations()).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("ホーム画面に追加するための manifest とアイコンを配信している", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.name).toBe("おやノート");
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(icon.src)).status(), icon.src).toBe(200);
  }
  expect((await request.get("/apple-touch-icon.png")).status()).toBe(200);
  expect((await request.get("/sw.js")).status()).toBe(200);
});
