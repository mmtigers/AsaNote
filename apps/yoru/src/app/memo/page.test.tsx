// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LIAISON_SETTINGS, type LiaisonMemo } from "@/lib/liaisonMemo";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useChildren: vi.fn(),
  fetchLiaisonSettings: vi.fn(),
  fetchLiaisonMemos: vi.fn(),
  saveMemoEdits: vi.fn(),
  markMemoSent: vi.fn(),
  unmarkMemoSent: vi.fn(),
  requestLiaisonDraft: vi.fn(),
}));
vi.mock("@/lib/auth/AuthProvider", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/lib/db/children", () => ({ useChildren: mocks.useChildren }));
vi.mock("@/lib/db/liaisonMemos", () => ({
  fetchLiaisonSettings: mocks.fetchLiaisonSettings,
  fetchLiaisonMemos: mocks.fetchLiaisonMemos,
  saveMemoEdits: mocks.saveMemoEdits,
  markMemoSent: mocks.markMemoSent,
  unmarkMemoSent: mocks.unmarkMemoSent,
  requestLiaisonDraft: mocks.requestLiaisonDraft,
}));

import MemoPage from "./page";

// 2026-11-12(木)の昼。設定は木曜。
const NOW = new Date("2026-11-12T03:00:00Z");
const memo = (over: Partial<LiaisonMemo> = {}): LiaisonMemo => ({
  id: "m1",
  childId: "c1",
  dueDate: "2026-11-12",
  status: "generated",
  error: null,
  draftText: "落ち着いて過ごせました。",
  editedText: null,
  contactDraftText: null,
  contactEditedText: null,
  finalText: null,
  sentAt: null,
  sentBy: null,
  regenerateCount: 0,
  asaFrom: "2026-11-06",
  asaTo: "2026-11-12",
  yoruFrom: "2026-11-05",
  yoruTo: "2026-11-11",
  ...over,
});

describe("/memo", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    mocks.useAuth.mockReturnValue({ session: { user: { id: "uA" } }, loading: false });
    mocks.useChildren.mockReturnValue([{ id: "c1", name: "ともや", created_by: "uA", created_at: "" }]);
    mocks.fetchLiaisonSettings.mockResolvedValue(
      new Map([["c1", { childId: "c1", ...DEFAULT_LIAISON_SETTINGS, enabled: true, consentedAt: "2026-11-01T00:00:00Z" }]])
    );
    mocks.fetchLiaisonMemos.mockResolvedValue([memo(), memo({ id: "m0", dueDate: "2026-11-05", finalText: "先週の文面", sentAt: "x" })]);
    mocks.markMemoSent.mockResolvedValue(undefined);
    mocks.requestLiaisonDraft.mockResolvedValue(undefined);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("今週の下書きと、これまでの連絡メモを出す", async () => {
    render(<MemoPage />);
    expect(((await screen.findByLabelText(/おうちでのご様子/)) as HTMLTextAreaElement).value).toBe("落ち着いて過ごせました。");
    expect(screen.getByText("11/6〜11/12の記録から作成")).toBeTruthy();
    expect(screen.getByText("先週の文面")).toBeTruthy();
  }, 10_000);

  it("「送った」で、本文を最終版として保存する", async () => {
    render(<MemoPage />);
    fireEvent.click(await screen.findByRole("button", { name: "送った" }));
    await waitFor(() => expect(mocks.markMemoSent).toHaveBeenCalledWith("m1", "落ち着いて過ごせました。"));
  });

  it("編集してから作り直すときは、確かめてから作り直す", async () => {
    render(<MemoPage />);
    fireEvent.change(await screen.findByLabelText(/おうちでのご様子/), { target: { value: "直した" } });
    fireEvent.change(screen.getByLabelText(/作り直す/), { target: { value: "もっと短く" } });
    fireEvent.click(screen.getByRole("button", { name: "作り直す" }));
    expect(mocks.requestLiaisonDraft).not.toHaveBeenCalled();
    expect(screen.getByText(/編集した内容は消えます/)).toBeTruthy();
  });

  it("今週の分がまだ無ければ「今すぐ作る」", async () => {
    mocks.fetchLiaisonMemos.mockResolvedValue([]);
    render(<MemoPage />);
    fireEvent.click(await screen.findByRole("button", { name: "今すぐ作る" }));
    await waitFor(() => expect(mocks.requestLiaisonDraft).toHaveBeenCalledWith("c1", null));
  });
});
