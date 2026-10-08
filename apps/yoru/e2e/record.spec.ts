import { expect, test } from "@playwright/test";
import { failOnAppErrors, openHome } from "./helpers";

test.describe("記録の基本の流れ(ログイン無し)", () => {
  test("様子と時刻とメモを入れて保存すると、ホームに結果が出て、タイムラインにも並ぶ", async ({ page }) => {
    const assertNoErrors = failOnAppErrors(page);
    await openHome(page);

    await page.getByRole("button", { name: "🌙 今夜の様子を記録する" }).click();
    const save = page.getByRole("button", { name: "✓ この日の記録を保存する" });
    // 様子を選ぶまでは保存できない。
    await expect(save).toBeDisabled();

    await page.getByRole("button", { name: /少し荒れた/ }).first().click();
    await expect(save).toBeEnabled();

    // 節目は時間帯のボタンをタップするだけ(消灯: 20時より前 / 20〜21時 / 21時以降)。
    await page.getByRole("button", { name: "20〜21時", exact: true }).last().click();
    await page.getByLabel("メモ").fill("E2Eテストの記録です");
    await save.click();

    // ホームに戻り、保存した記録の要約が出る。
    await expect(page.getByRole("button", { name: /少し荒れた夜/ })).toBeVisible();
    await expect(page.getByText(/20〜21時に消灯/)).toBeVisible();

    // タイムラインにも並ぶ。
    await page.getByRole("link", { name: /これまで/ }).click();
    await expect(page.getByRole("heading", { name: "これまでの記録" })).toBeVisible();
    await expect(page.getByText("E2Eテストの記録です")).toBeVisible();

    assertNoErrors();
  });

  test("保存した記録を開き直すと、入力した内容が残っている", async ({ page }) => {
    await openHome(page);
    await page.getByRole("button", { name: "🌙 今夜の様子を記録する" }).click();
    await page.getByRole("button", { name: /穏やか/ }).first().click();
    await page.getByLabel("メモ").fill("あとで見返す");
    await page.getByRole("button", { name: "✓ この日の記録を保存する" }).click();
    await expect(page.getByRole("button", { name: /穏やかな夜/ })).toBeVisible();

    // 開き直す(再読み込み相当)。保存済みの記録は IndexedDB に残っている。
    await page.goto("/");
    await page.getByRole("button", { name: /記録を編集する/ }).click();
    await expect(page.getByLabel("メモ")).toHaveValue("あとで見返す");
    await expect(page.getByRole("button", { name: /穏やか/ }).first()).toHaveAttribute("aria-pressed", "true");
  });

  test("途中でもどると下書きが残り、ナビに入力途中の印が付く", async ({ page }) => {
    await openHome(page);
    await page.getByRole("button", { name: "🌙 今夜の様子を記録する" }).click();
    await page.getByLabel("メモ").fill("書きかけのメモ");

    await page.getByRole("link", { name: /これまで/ }).click();
    await expect(page.getByText("入力途中の記録があります")).toBeAttached();

    // 下書きがあるときは、ホームに戻るとそのままフォームが開く。
    await page.getByRole("link", { name: /記録する/ }).click();
    await expect(page.getByLabel("メモ")).toHaveValue("書きかけのメモ");
  });
});
