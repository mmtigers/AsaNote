import { expect, test, type Page } from "@playwright/test";
import { failOnAppErrors } from "./helpers";
import { installFakeSupabase, USER } from "./fakeSupabase";

// 連絡メモの下書き(docs/liaison-memo.md §10 の E2E。#297)。本物の Supabase・Claude API は使わず、
// placeholder の Supabase への通信を fakeSupabase.ts で横取りして、ログインした状態の画面を確かめる。

const CHILD = { id: "22222222-2222-4222-8222-222222222222", name: "ともや", created_by: USER.id, created_at: "2026-01-01T00:00:00Z" };
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 日本時間の今日と、その曜日(予定日 = 今日にするため、設定の曜日を今日に合わせる)。
function jstToday(): { date: string; weekday: number } {
  const d = new Date(Date.now() + JST_OFFSET_MS);
  return { date: d.toISOString().slice(0, 10), weekday: d.getUTCDay() };
}

function settingsRow(enabled: boolean) {
  const { weekday } = jstToday();
  return {
    child_id: CHILD.id,
    enabled,
    consented_by: enabled ? USER.id : null,
    consented_at: enabled ? "2026-11-01T00:00:00Z" : null,
    weekday,
    hour: 13,
    target_chars: 80,
    recipient_label: "療育先",
    include_memo: true,
    style_examples: [],
    masked_names: [],
    updated_by: USER.id,
    updated_at: "2026-11-01T00:00:00Z",
  };
}

const DRAFT = "宿題に取りかかるまで時間がかかる日もありましたが、毎日登校できました。頑張っているようです。";

function memoRow(over: Record<string, unknown> = {}) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    child_id: CHILD.id,
    due_date: jstToday().date,
    status: "generated",
    error: null,
    attempts: 1,
    locked_at: null,
    draft_text: DRAFT,
    edited_text: null,
    contact_draft_text: "",
    contact_edited_text: null,
    final_text: null,
    sent_at: null,
    sent_by: null,
    regenerate_count: 0,
    asa_from: "2026-11-01",
    asa_to: "2026-11-07",
    yoru_from: "2026-11-01",
    yoru_to: "2026-11-07",
    ...over,
  };
}

async function openMemo(page: Page) {
  await page.goto("/memo");
  await expect(page.getByRole("heading", { name: "連絡メモ", level: 1 })).toBeVisible();
}

test.describe("連絡メモ(/memo)", () => {
  test("下書きを表示し、編集を自動で保存し、コピーして「送った」にできる", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const assertNoErrors = failOnAppErrors(page);
    const fake = await installFakeSupabase(page, {
      tables: { children: [CHILD], liaison_memo_settings: [settingsRow(true)], liaison_memos: [memoRow()] },
    });

    await openMemo(page);
    const body = page.getByRole("textbox", { name: /おうちでのご様子/ });
    await expect(body).toHaveValue(DRAFT);
    await expect(page.getByText("11/1〜11/7の記録から作成")).toBeVisible();

    // 編集は少し待ってから自動で保存される。
    await body.fill(`${DRAFT}運動会の練習も楽しんでいます。`);
    await expect(page.getByText("編集を保存しました")).toBeVisible();
    expect(fake.writes).toContainEqual(
      expect.objectContaining({ table: "liaison_memos", method: "PATCH", body: expect.objectContaining({ edited_text: `${DRAFT}運動会の練習も楽しんでいます。` }) })
    );

    await page.getByRole("button", { name: "コピー" }).click();
    await expect(page.getByRole("button", { name: "コピーしました" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${DRAFT}運動会の練習も楽しんでいます。`);

    await page.getByRole("button", { name: "送った", exact: true }).click();
    await expect(page.getByRole("button", { name: "「送った」を取り消す" })).toBeVisible();
    expect(fake.tables.liaison_memos![0]).toMatchObject({ final_text: `${DRAFT}運動会の練習も楽しんでいます。` });
    expect(fake.tables.liaison_memos![0]!.sent_at).toBeTruthy();

    await page.getByRole("button", { name: "「送った」を取り消す" }).click();
    await expect(page.getByRole("button", { name: "送った", exact: true })).toBeVisible();
    assertNoErrors();
  });

  test("編集してから作り直すときは確認を出し、やめれば作り直さない。作り直すと希望つきで関数を呼ぶ", async ({ page }) => {
    const assertNoErrors = failOnAppErrors(page);
    const fake = await installFakeSupabase(page, {
      tables: { children: [CHILD], liaison_memo_settings: [settingsRow(true)], liaison_memos: [memoRow({ edited_text: "直した文面" })] },
      onFunction: (_name, _body, state) => {
        Object.assign(state.tables.liaison_memos![0]!, { draft_text: "作り直した下書きです。", edited_text: null, regenerate_count: 1 });
        return { ok: true };
      },
    });

    await openMemo(page);
    await expect(page.getByText("作り直す(あと3回)")).toBeVisible();
    await page.getByPlaceholder(/もっと短く/).fill("もっと短く");
    await page.getByRole("button", { name: "作り直す" }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("編集した内容は消えます");
    await dialog.getByRole("button", { name: "キャンセル" }).click();
    expect(fake.functionCalls).toHaveLength(0);

    await page.getByRole("button", { name: "作り直す" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "作り直す" }).click();
    await expect(page.getByRole("textbox", { name: /おうちでのご様子/ })).toHaveValue("作り直した下書きです。");
    await expect(page.getByText("作り直す(あと2回)")).toBeVisible();
    expect(fake.functionCalls).toEqual([
      { name: "generate-liaison-memos", body: { child_id: CHILD.id, instruction: "もっと短く" } },
    ]);
    assertNoErrors();
  });

  test("今週の回がまだ無ければ「今すぐ作る」で関数を呼び、できた下書きを出す", async ({ page }) => {
    const assertNoErrors = failOnAppErrors(page);
    const fake = await installFakeSupabase(page, {
      tables: { children: [CHILD], liaison_memo_settings: [settingsRow(true)], liaison_memos: [] },
      onFunction: (_name, _body, state) => {
        state.tables.liaison_memos!.push(memoRow({ regenerate_count: 1 }));
        return { ok: true };
      },
    });

    await openMemo(page);
    await expect(page.getByText("まだ作っていません")).toBeVisible();
    await page.getByRole("button", { name: "今すぐ作る" }).click();
    await expect(page.getByRole("textbox", { name: /おうちでのご様子/ })).toHaveValue(DRAFT);
    expect(fake.functionCalls).toEqual([{ name: "generate-liaison-memos", body: { child_id: CHILD.id, instruction: null } }]);
    assertNoErrors();
  });

  test("ホームのお知らせカードから /memo へ移れる", async ({ page }) => {
    const assertNoErrors = failOnAppErrors(page);
    await installFakeSupabase(page, {
      tables: { children: [CHILD], liaison_memo_settings: [settingsRow(true)], liaison_memos: [memoRow()] },
    });

    await page.goto("/");
    // カード全体が /memo へのリンク(読み上げではお知らせ(status)として出る)。
    const notice = page.getByRole("status").filter({ hasText: "今週の連絡メモの下書きができました" });
    await expect(notice).toBeVisible();
    await notice.click();
    await expect(page).toHaveURL(/\/memo$/);
    await expect(page.getByRole("textbox", { name: /おうちでのご様子/ })).toHaveValue(DRAFT);
    assertNoErrors();
  });
});

test.describe("共有の「連絡メモ」の設定", () => {
  test("同意してオンにでき、項目を変えて保存できる", async ({ page, context }) => {
    await context.grantPermissions(["notifications"]);
    const assertNoErrors = failOnAppErrors(page);
    const fake = await installFakeSupabase(page, {
      tables: { children: [CHILD], liaison_memo_settings: [] },
    });

    await page.goto("/group");
    await page.getByRole("switch", { name: "連絡メモの下書き", exact: true }).click();
    const consent = page.getByRole("dialog", { name: "AI に送る内容の確認" });
    await expect(consent).toContainText("Anthropic");
    await consent.getByRole("button", { name: "同意してオンにする" }).click();

    await expect(page.getByRole("switch", { name: "連絡メモの下書き", exact: true })).toBeChecked();
    expect(fake.tables.liaison_memo_settings![0]).toMatchObject({ child_id: CHILD.id, enabled: true });

    const section = page.getByRole("region", { name: "連絡メモ" });
    await section.getByLabel("時刻").selectOption("20");
    await section.getByRole("button", { name: "保存する" }).click();
    await expect(section.getByText("保存しました")).toBeVisible();
    expect(fake.tables.liaison_memo_settings![0]).toMatchObject({ hour: 20 });
    assertNoErrors();
  });
});
