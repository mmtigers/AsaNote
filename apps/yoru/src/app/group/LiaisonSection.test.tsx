// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LIAISON_SETTINGS, type LiaisonSettings } from "@/lib/liaisonMemo";

const mocks = vi.hoisted(() => ({
  fetchLiaisonSettings: vi.fn(),
  saveLiaisonSettings: vi.fn(),
}));
vi.mock("@/lib/db/liaisonMemos", () => mocks);

import { LiaisonSection } from "./LiaisonSection";

const CHILD = { id: "c1", name: "ともや", created_by: "uA", created_at: "2026-01-01" };
const off: LiaisonSettings = { childId: "c1", ...DEFAULT_LIAISON_SETTINGS };

function renderSection(onEnabled = vi.fn(async () => {})) {
  render(<LiaisonSection childList={[CHILD]} currentUserId="uA" onError={() => {}} onEnabled={onEnabled} />);
  return onEnabled;
}

describe("LiaisonSection", () => {
  beforeEach(() => {
    mocks.fetchLiaisonSettings.mockResolvedValue(new Map([["c1", off]]));
    mocks.saveLiaisonSettings.mockImplementation(async (s: LiaisonSettings) => ({
      ...s,
      consentedBy: s.enabled ? "uA" : null,
      consentedAt: s.enabled ? "2026-11-12T00:00:00Z" : null,
    }));
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("オンにする前に、AI に送る内容を示して同意を求める(やめれば保存しない)", async () => {
    renderSection();
    fireEvent.click(await screen.findByRole("switch", { name: "連絡メモの下書き" }));
    expect(screen.getByRole("dialog", { name: "AI に送る内容の確認" }).textContent).toContain("Anthropic");
    fireEvent.click(screen.getByRole("button", { name: "やめる" }));
    expect(mocks.saveLiaisonSettings).not.toHaveBeenCalled();
  });

  it("同意するとオンで保存し、通知の準備をして、設定の項目と同意した人を出す", async () => {
    const onEnabled = renderSection();
    fireEvent.click(await screen.findByRole("switch", { name: "連絡メモの下書き" }));
    fireEvent.click(screen.getByRole("button", { name: "同意してオンにする" }));
    await waitFor(() => expect(mocks.saveLiaisonSettings).toHaveBeenCalledWith(expect.objectContaining({ enabled: true })));
    await waitFor(() => expect(onEnabled).toHaveBeenCalled());
    expect(await screen.findByText(/あなたが2026\/11\/12にオンにしました/)).toBeTruthy();
    expect((screen.getByLabelText("文字数(おうちでのご様子)") as HTMLSelectElement).value).toBe("80");
  });

  it("項目を変えて保存する", async () => {
    mocks.fetchLiaisonSettings.mockResolvedValue(
      new Map([["c1", { ...off, enabled: true, consentedBy: "uB", consentedAt: "2026-11-01T00:00:00Z" }]])
    );
    renderSection();
    expect(await screen.findByText(/家族の方が/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("時刻"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));
    await waitFor(() => expect(mocks.saveLiaisonSettings).toHaveBeenCalledWith(expect.objectContaining({ hour: 20 })));
  });
});
