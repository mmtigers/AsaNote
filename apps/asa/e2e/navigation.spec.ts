import { expect, test } from "@playwright/test";

// 下部ナビ: 「記録する」は真ん中の丸いボタン。各タブから、記録が1件も無い状態でも画面が開くこと。
test("下部ナビは「記録する」を真ん中に置き、各タブの画面が開く", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");

  const nav = page.getByRole("navigation", { name: "メインメニュー" });
  const labels = await nav.getByRole("link").allTextContents();
  expect(labels.map((l) => l.trim())).toEqual(["📅これまで", "📊傾向", "📝記録する", "💡試したこと", "👨‍👩‍👧共有"]);
  await expect(nav.getByRole("link", { name: /記録する/ })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: /試したこと/ }).click();
  await expect(page.getByRole("heading", { name: "💡 試したこと" })).toBeVisible();
  await expect(page.getByText("ログインすると、家族で共有できます。")).toBeVisible();
  await expect(nav.getByRole("link", { name: /試したこと/ })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: /記録する/ })).not.toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: /記録する/ }).click();
  await expect(page.getByRole("button", { name: "今日の様子を記録する" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
