import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalRecord } from "@/lib/db/localDb";
import type { Draft, Step } from "./types";

const { loadDraftMock, findLatestOwnRecordForDateMock, saveRecordMock } = vi.hoisted(() => ({
  loadDraftMock: vi.fn(),
  findLatestOwnRecordForDateMock: vi.fn(),
  saveRecordMock: vi.fn(),
}));

vi.mock("./draftStorage", () => ({
  loadDraft: loadDraftMock,
}));

vi.mock("@/lib/db/records", () => ({
  findLatestOwnRecordForDate: findLatestOwnRecordForDateMock,
  saveRecord: saveRecordMock,
}));

const { useRecordForm } = await import("./useRecordForm");

function makeExisting(overrides: Partial<LocalRecord> = {}): LocalRecord {
  return {
    id: "existing-id",
    recordDate: "2025-09-14",
    outcome: null,
    wakeTime: null,
    wakeTags: [],
    triggerTags: [],
    reasonTags: [],
    responseTags: [],
    departTime: null,
    companion: null,
    handoff: null,
    memo: null,
    userId: "user-1",
    createdAt: "2025-09-14T00:00:00.000Z",
    updatedAt: "2025-09-14T00:00:00.000Z",
    syncStatus: "synced",
    ...overrides,
  };
}

function renderUseRecordForm(
  overrides: Partial<{ date: string; today: string; userId: string | null; childId: string | null; cameFromEditLink: boolean }> = {}
) {
  const goToStep = vi.fn();
  const restoreStep = vi.fn();
  const goHome = vi.fn();
  const cameFromEditLink = { current: overrides.cameFromEditLink ?? false };

  const hook = renderHook(() =>
    useRecordForm({
      date: overrides.date ?? "2025-09-14",
      today: overrides.today ?? "2025-09-14",
      userId: overrides.userId ?? "user-1",
      childId: overrides.childId ?? null,
      cameFromEditLink,
      goToStep,
      restoreStep,
      goHome,
    })
  );

  return { ...hook, goToStep, restoreStep, goHome, cameFromEditLink };
}

beforeEach(() => {
  loadDraftMock.mockReturnValue(null);
  findLatestOwnRecordForDateMock.mockResolvedValue(undefined);
  saveRecordMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useRecordForm", () => {
  it("下書きが同じ日付にあれば、それをフォームへ復元しステップも復元する", async () => {
    const draft: Draft = {
      date: "2025-09-14",
      step: "reason" as Step,
      detailOpen: true,
      form: {
        id: "draft-id",
        outcome: "reluctant",
        reasonTags: ["注意された"],
        departTime: "07:50",
        memo: "メモ",
        conditionScale: null,
        wakeTime: "",
        wakeTags: [],
        triggerTags: [],
        responseTags: [],
        companion: "",
        handoff: "",
      },
    };
    loadDraftMock.mockReturnValue(draft);

    const { result, restoreStep } = renderUseRecordForm();

    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.form).toEqual(draft.form);
    expect(restoreStep).toHaveBeenCalledWith("reason");
    expect(result.current.detailOpen).toBe(true);
    expect(findLatestOwnRecordForDateMock).not.toHaveBeenCalled();
  });

  it("下書きが無ければDexieから当日の既存記録を読み込む", async () => {
    const existing = makeExisting({ outcome: "smooth", reasonTags: ["天気が良かった"], departTime: "07:40" });
    findLatestOwnRecordForDateMock.mockResolvedValue(existing);

    const { result } = renderUseRecordForm();

    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.form).toMatchObject({
      id: existing.id,
      outcome: "smooth",
      reasonTags: ["天気が良かった"],
      departTime: "07:40",
    });
  });

  it("下書きも既存記録も無ければ空のフォームになる", async () => {
    const { result } = renderUseRecordForm();

    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.form.outcome).toBeNull();
    expect(result.current.form.reasonTags).toEqual([]);
  });

  it("編集リンク経由でoutcome済みの記録があればreasonステップへ自動遷移する", async () => {
    const existing = makeExisting({ outcome: "reluctant", memo: "メモあり" });
    findLatestOwnRecordForDateMock.mockResolvedValue(existing);

    const { result, restoreStep } = renderUseRecordForm({ cameFromEditLink: true });

    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(restoreStep).toHaveBeenCalledWith("reason");
    expect(result.current.detailOpen).toBe(true);
  });

  it("編集リンク経由でoutcome未設定の記録ならresultステップへ自動遷移する", async () => {
    const existing = makeExisting({ outcome: null });
    findLatestOwnRecordForDateMock.mockResolvedValue(existing);

    const { result, restoreStep } = renderUseRecordForm({ cameFromEditLink: true });

    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(restoreStep).toHaveBeenCalledWith("result");
  });

  it("selectOutcomeは同じカテゴリ内の切り替えならreasonTagsを維持する", async () => {
    const existing = makeExisting({ outcome: "reluctant", reasonTags: ["注意された"] });
    findLatestOwnRecordForDateMock.mockResolvedValue(existing);

    const { result, goToStep } = renderUseRecordForm();
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.selectOutcome("absent");
    });

    expect(result.current.form.reasonTags).toEqual(["注意された"]);
    expect(goToStep).toHaveBeenCalledWith("reason", "forward");
  });

  it("selectOutcomeはsmooth⇔非smoothの切り替えでreasonTagsをリセットする", async () => {
    const existing = makeExisting({ outcome: "smooth", reasonTags: ["天気が良かった"] });
    findLatestOwnRecordForDateMock.mockResolvedValue(existing);

    const { result } = renderUseRecordForm();
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.selectOutcome("reluctant");
    });

    expect(result.current.form.reasonTags).toEqual([]);
    expect(result.current.detailOpen).toBe(true);
  });

  it("handleSaveはsaveRecordを呼び、toastを表示してから一定時間後に消し、goHomeを呼ぶ", async () => {
    const { result, goHome } = renderUseRecordForm();
    await waitFor(() => expect(result.current.loaded).toBe(true));

    vi.useFakeTimers();

    await act(async () => {
      await result.current.handleSave();
    });

    expect(saveRecordMock).toHaveBeenCalledTimes(1);
    expect(result.current.toast).toBe(true);
    expect(goHome).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1800);
    });

    expect(result.current.toast).toBe(false);
  });
});
