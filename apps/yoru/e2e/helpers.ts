import { expect, type Page } from "@playwright/test";

// 外部(フォント等)への通信失敗は、アプリの不具合ではないので無視する。
export function failOnAppErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return () => expect(errors, "ページ内で未処理の例外が起きていない").toEqual([]);
}

export async function openHome(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /今夜の様子を記録する|記録を編集する/ }).first()).toBeVisible();
}
