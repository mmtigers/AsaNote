import { expect, test } from "@playwright/test";
import { failOnAppErrors } from "./helpers";
import { installFakeSupabase, USER } from "./fakeSupabase";

// 退会(#290)。本物の Supabase は使わず、Edge Function(delete-account)の応答を fakeSupabase.ts で返す。

test("退会: 確認の文言を入れて退会すると、関数を呼び、この端末のデータを消して最初の画面へ戻る", async ({ page }) => {
  const assertNoErrors = failOnAppErrors(page);
  const fake = await installFakeSupabase(page, {
    tables: { children: [{ id: "c1", name: "ともや", created_by: USER.id, created_at: "2026-01-01T00:00:00Z" }] },
  });

  await page.goto("/group");
  const section = page.getByRole("region", { name: "退会" });
  await section.getByRole("button", { name: "退会する(アカウントと記録をすべて削除)" }).click();
  await expect(section).toContainText("あさノートの記録(写真を含む)");

  const submit = section.getByRole("button", { name: "退会する", exact: true });
  await expect(submit).toBeDisabled();
  await section.getByLabel(/と入力してください/).fill("退会する");
  await submit.click();

  await expect(page.getByText("退会しました")).toBeVisible();
  expect(fake.functionCalls).toEqual([{ name: "delete-account", body: { confirm: "退会する" } }]);

  await page.getByRole("button", { name: "閉じる" }).click();
  await expect(page).toHaveURL(/\/$/);
  // セッション(supabase-js の localStorage)が消え、ログインしていない状態に戻る。
  expect(await page.evaluate(() => window.localStorage.getItem("sb-placeholder-auth-token"))).toBeNull();
  assertNoErrors();
});
