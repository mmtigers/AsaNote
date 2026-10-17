import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// サーバーの呼び出しは素の関数で差し替える(reject を vi.fn に通さない。membership.test.tsx を参照)。
const { server } = vi.hoisted(() => ({
  server: {
    record: null as unknown,
    fetchError: null as unknown,
    saveError: null as unknown,
    saveCalls: [] as { complete: boolean; input: unknown }[],
    outcome: null as unknown,
    photo: null as unknown,
  },
}));
vi.mock("@/lib/db/records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/records")>()),
  fetchOwnRecord: () => (server.fetchError ? Promise.reject(server.fetchError) : Promise.resolve(server.record)),
  completeOwnRecord: () => Promise.resolve({ completedAt: "t", photo: server.photo }),
}));
vi.mock("@/lib/saveRecord", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/saveRecord")>()),
  saveDailyRecord: (params: { complete: boolean; input: unknown }) => {
    server.saveCalls.push({ complete: params.complete, input: params.input });
    if (server.saveError) return Promise.reject(server.saveError);
    return Promise.resolve(server.outcome);
  },
}));
vi.mock("@/lib/photos", () => ({ getPhotoUrl: () => Promise.resolve("https://example.supabase.co/signed/p1.jpg") }));

import { EMPTY_INPUT } from "@/lib/db/records";
import { loadDraft, saveDraft } from "@/lib/recordDraft";
import { RecordForm } from "./RecordForm";

const DATE = "2026-10-17";
const savedRecord = (overrides = {}) => ({
  id: "r1",
  userId: "u1",
  recordDate: DATE,
  completedAt: null,
  updatedAt: "2026-10-17T03:00:00Z",
  ...EMPTY_INPUT,
  ...overrides,
});

beforeEach(() => {
  server.record = null;
  server.fetchError = null;
  server.saveError = null;
  server.saveCalls = [];
  server.outcome = { status: "saved", record: savedRecord() };
  server.photo = null;
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderForm() {
  render(<RecordForm userId="u1" familyId="f1" recordDate={DATE} />);
  return screen.findByRole("button", { name: /記録を完了する|修正を保存する/ });
}

function choose(group: string, option: string) {
  fireEvent.click(within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", { name: option }));
}

describe("RecordForm", () => {
  it("まだ記録していない日は、すべて未入力で始まる", async () => {
    await renderForm();
    expect(screen.getByText("まだ記録していません")).toBeTruthy();
    expect(screen.getAllByText("(未入力)")).toHaveLength(8);
  });

  it("選んだ内容で「記録を完了する」と、完了として保存し、写真の画面を出す", async () => {
    server.outcome = { status: "completed", record: savedRecord({ completedAt: "t" }), completedAt: "t", photo: { photoId: "p1", storagePath: "f/p1.jpg" } };
    await renderForm();
    choose("朝食", "食べた");
    choose("お薬", "飲んだ");
    choose("外出", "しなかった");
    fireEvent.click(screen.getByRole("button", { name: "記録を完了する" }));
    expect(await screen.findByText("記録しました。おつかれさまでした")).toBeTruthy();
    expect((await screen.findByRole("img", { name: "今日の写真" })).getAttribute("src")).toContain("signed/p1.jpg");
    expect(server.saveCalls).toEqual([
      { complete: true, input: { ...EMPTY_INPUT, breakfast: "ate", medication: "taken", wentOut: false } },
    ]);
  });

  it("「途中で保存する」は、完了にせず保存する", async () => {
    await renderForm();
    choose("体調", "ふつう");
    fireEvent.click(screen.getByRole("button", { name: "途中で保存する" }));
    expect(await screen.findByText("保存しました。")).toBeTruthy();
    expect(server.saveCalls[0]).toMatchObject({ complete: false });
  });

  it("保存に失敗したら、案内を出し、入力は画面と端末に残る", async () => {
    server.saveError = new TypeError("Failed to fetch");
    await renderForm();
    choose("昼食", "少し食べた");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "散歩した" } });
    fireEvent.click(screen.getByRole("button", { name: "記録を完了する" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/通信エラー/);
    expect(within(screen.getByRole("radiogroup", { name: "昼食" })).getByRole("radio", { name: "少し食べた" }).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("散歩した");
    expect(loadDraft("u1", DATE)?.input).toMatchObject({ lunch: "little", memo: "散歩した" });
  });

  it("完了だけできなかったときは、保存済みと伝えて、完了をもう一度押せるようにする", async () => {
    server.outcome = { status: "saved-not-completed", record: savedRecord(), error: new TypeError("Failed to fetch") };
    await renderForm();
    fireEvent.click(screen.getByRole("button", { name: "記録を完了する" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/記録は保存しました。ただ、完了にできませんでした/);
    expect(screen.getByRole("button", { name: "記録を完了する" })).toBeTruthy();
  });

  it("保存済みの記録を読み込んで表示する", async () => {
    server.record = savedRecord({ breakfast: "none", memo: "前の内容" });
    await renderForm();
    expect(screen.getByText("途中まで保存しています")).toBeTruthy();
    expect(within(screen.getByRole("radiogroup", { name: "朝食" })).getByRole("radio", { name: "食べていない" }).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("前の内容");
  });

  it("保存していない入力(サーバーより新しい下書き)があれば、そちらを出して知らせる", async () => {
    server.record = savedRecord({ breakfast: "none" });
    saveDraft("u1", DATE, { ...EMPTY_INPUT, breakfast: "ate" }, new Date("2026-10-17T04:00:00Z"));
    await renderForm();
    expect(screen.getByRole("status").textContent).toMatch(/保存していない入力があります/);
    expect(within(screen.getByRole("radiogroup", { name: "朝食" })).getByRole("radio", { name: "食べた" }).getAttribute("aria-checked")).toBe("true");
  });

  it("古い下書きは使わない(サーバーの記録の方が新しい)", async () => {
    server.record = savedRecord({ breakfast: "none" });
    saveDraft("u1", DATE, { ...EMPTY_INPUT, breakfast: "ate" }, new Date("2026-10-17T01:00:00Z"));
    await renderForm();
    expect(within(screen.getByRole("radiogroup", { name: "朝食" })).getByRole("radio", { name: "食べていない" }).getAttribute("aria-checked")).toBe("true");
  });

  it("完了済みの日は、修正の保存(完了のまま)と、その日の写真の再表示ができる", async () => {
    server.record = savedRecord({ completedAt: "t" });
    // サーバーは修正の後も completed_at を保つ(ローカルの Supabase で確認済み)。
    server.outcome = { status: "saved", record: savedRecord({ completedAt: "t" }) };
    server.photo = { photoId: "p1", storagePath: "f/p1.jpg" };
    await renderForm();
    expect(screen.getByText(/この日の記録は完了しています/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "途中で保存する" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "修正を保存する" }));
    await screen.findByText("保存しました。");
    expect(server.saveCalls[0]).toMatchObject({ complete: false });
    fireEvent.click(screen.getByRole("button", { name: "この日の写真を見る" }));
    expect(await screen.findByRole("img", { name: "今日の写真" })).toBeTruthy();
  });

  it("写真が無い日も、完了したことを伝える", async () => {
    server.outcome = { status: "completed", record: savedRecord({ completedAt: "t" }), completedAt: "t", photo: null };
    await renderForm();
    fireEvent.click(screen.getByRole("button", { name: "記録を完了する" }));
    expect(await screen.findByText(/今日の写真はありません。記録は保存されています/)).toBeTruthy();
  });

  it("保存済みの記録を読み込めなくても、下書きから入力を続けられる", async () => {
    server.fetchError = new TypeError("Failed to fetch");
    saveDraft("u1", DATE, { ...EMPTY_INPUT, dinner: "ate" });
    await renderForm();
    expect(screen.getByRole("alert").textContent).toMatch(/入力して保存することはできます/);
    expect(within(screen.getByRole("radiogroup", { name: "夕食" })).getByRole("radio", { name: "食べた" }).getAttribute("aria-checked")).toBe("true");
  });
});
