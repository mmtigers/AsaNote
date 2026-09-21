import { expect, test } from "@playwright/test";

// 記録フォームの入力→保存→タイムライン反映の一連の流れ。ログイン不要な
// オフライン専用の範囲のみを対象とする(ログイン前提のグループE2Eは別Issue)。
test("記録フォームに入力して保存すると、ホームとタイムラインの両方に反映される", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "今日の様子を記録する" }).click();

  await page.getByRole("button", { name: /スムーズに行けた/ }).click();

  await page.getByRole("button", { name: "早寝早起きできた", exact: true }).click();

  // 出発時刻は選択式(時・分)。選ぶとプレビューに反映される。
  await page.getByLabel("出発時刻(時)").selectOption("07");
  await page.getByLabel("出発時刻(分)").selectOption("30");
  await expect(page.getByText("07:30に出発")).toBeVisible();

  await page.getByRole("button", { name: /詳細を追加/ }).click();
  const memo = "E2Eテストからのメモ";
  await page.getByLabel("振り返りメモ").fill(memo);

  await page.getByRole("button", { name: "この日の記録を保存する" }).click();

  // ホームへ戻り、記録済みの要約カードが表示される
  await expect(page.getByRole("button", { name: "記録を編集する" })).toBeVisible();
  await expect(page.getByText("スムーズに行けた")).toBeVisible();

  // タイムラインにも反映される
  await page.getByRole("link", { name: "これまで" }).click();
  await expect(page).toHaveURL(/\/timeline$/);
  await expect(page.getByText(memo)).toBeVisible();
  await expect(page.getByText("早寝早起きできた")).toBeVisible();

  // カードをタップすると、その日の記録の編集画面が開く(削除はゴミ箱アイコン側)
  await expect(page.getByRole("button", { name: /の記録を削除する$/ })).toBeVisible();
  await page.getByRole("link", { name: /の記録を編集する$/ }).click();
  await expect(page).toHaveURL(/\/\?date=/);
  await expect(page.getByRole("button", { name: "この日の記録を保存する" })).toBeVisible();
});

// 記録フローの途中から下部ナビの「記録する」を押したとき、既にホームにいるため
// Link だけでは画面が変わらず、ステップが残ってしまっていた。
test("記録フローの途中で「記録する」タブを押すと最初の画面に戻る", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "今日の様子を記録する" }).click();
  await expect(page.getByText("今日はどうだった？")).toBeVisible();

  await page.getByRole("link", { name: "記録する" }).click();

  await expect(page.getByRole("button", { name: "今日の様子を記録する" })).toBeVisible();
});
