import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), signOut: vi.fn() }));
vi.mock("../supabase/client", () => ({
  getSupabaseClient: () => ({ functions: { invoke: mocks.invoke }, auth: { signOut: mocks.signOut } }),
}));

import { DeleteAccountSection } from "./DeleteAccountSection";

function renderSection() {
  const prepare = vi.fn().mockResolvedValue(undefined);
  const clearLocal = vi.fn().mockResolvedValue(undefined);
  render(<DeleteAccountSection appName="あさノート" otherAppName="よるノート" exportHref="/export" prepare={prepare} clearLocal={clearLocal} />);
  return { prepare, clearLocal };
}

function openAndType(text: string) {
  fireEvent.click(screen.getByRole("button", { name: "退会する(アカウントと記録をすべて削除)" }));
  fireEvent.change(screen.getByLabelText(/と入力してください/), { target: { value: text } });
}

describe("DeleteAccountSection(#290)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    mocks.signOut.mockResolvedValue({ error: null });
  });
  afterEach(cleanup);

  it("消えるもの(もう一方のアプリの記録も)と、書き出しへの案内を示す", () => {
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "退会する(アカウントと記録をすべて削除)" }));
    expect(screen.getByText("よるノートの記録(写真を含む)")).toBeTruthy();
    expect(screen.getByText(/パートナーに引き継がれます/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "書き出し" }).getAttribute("href")).toBe("/export");
  });

  it("確認の文言を入力するまで、退会のボタンは押せない", () => {
    renderSection();
    openAndType("退会");
    expect((screen.getByRole("button", { name: "退会する" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/と入力してください/), { target: { value: "退会する" } });
    expect((screen.getByRole("button", { name: "退会する" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("退会すると、準備 → 削除の関数 → この端末のデータの消去の順に行い、完了を伝える", async () => {
    const { prepare, clearLocal } = renderSection();
    openAndType("退会する");
    fireEvent.click(screen.getByRole("button", { name: "退会する" }));
    expect(await screen.findByText("退会しました")).toBeTruthy();
    expect(mocks.invoke).toHaveBeenCalledWith("delete-account", { body: { confirm: "退会する" } });
    expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(mocks.invoke.mock.invocationCallOrder[0]!);
    expect(mocks.invoke.mock.invocationCallOrder[0]).toBeLessThan(clearLocal.mock.invocationCallOrder[0]!);
  });

  it("削除に失敗したら、理由を出し、この端末のデータは消さない", async () => {
    mocks.invoke.mockResolvedValue({ data: { ok: false, message: "退会の処理に失敗しました。時間をおいてもう一度お試しください" }, error: null });
    const { clearLocal } = renderSection();
    openAndType("退会する");
    fireEvent.click(screen.getByRole("button", { name: "退会する" }));
    expect((await screen.findByRole("alert")).textContent).toContain("時間をおいて");
    expect(clearLocal).not.toHaveBeenCalled();
  });

  it("準備(Push の解除など)に失敗しても、退会は続ける", async () => {
    const { prepare } = renderSection();
    prepare.mockRejectedValue(new Error("push"));
    openAndType("退会する");
    fireEvent.click(screen.getByRole("button", { name: "退会する" }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalled());
    expect(await screen.findByText("退会しました")).toBeTruthy();
  });

  it("完了を閉じると、この端末のセッションだけを捨てて最初の画面へ戻る", async () => {
    const replace = vi.fn();
    vi.stubGlobal("location", { ...window.location, replace });
    renderSection();
    openAndType("退会する");
    fireEvent.click(screen.getByRole("button", { name: "退会する" }));
    fireEvent.click(await screen.findByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    vi.unstubAllGlobals();
  });
});
