import { expect, test } from "@playwright/test";
import { failOnAppErrors } from "./helpers";

// 下部ナビの各ページが、記録が1件も無い状態でも例外なく開くこと(空表示の確認)。
const PAGES = [
  { link: /これまで/, heading: "これまでの記録" },
  { link: /傾向/, text: /記録がまだ無い/ },
  { link: /試したこと/, text: /試したこと/ },
  { link: /共有/, text: /共有|ログイン/ },
];

test("全ページが空の状態でも開ける", async ({ page }) => {
  const assertNoErrors = failOnAppErrors(page);
  await page.goto("/");
  for (const target of PAGES) {
    await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: target.link }).click();
    if (target.heading) await expect(page.getByRole("heading", { name: target.heading })).toBeVisible();
    else await expect(page.getByText(target.text!).first()).toBeVisible();
  }
  assertNoErrors();
});

test("現在地のタブに aria-current が付く", async ({ page }) => {
  await page.goto("/timeline");
  await expect(page.getByRole("link", { name: /これまで/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: /記録する/ })).not.toHaveAttribute("aria-current", "page");
});

test("サービスワーカーが登録され、manifest が読める", async ({ page, request }) => {
  await page.goto("/");
  const registered = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return Boolean(reg.active);
  });
  expect(registered).toBe(true);

  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).ok(), `${icon.src} が取得できる`).toBe(true);
  }
});
