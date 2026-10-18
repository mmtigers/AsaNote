import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_INPUT, type DailyRecord } from "@/lib/db/records";

const mocks = vi.hoisted(() => ({ fetchRecord: vi.fn() }));
vi.mock("@/lib/db/records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/records")>()),
  fetchRecord: mocks.fetchRecord,
}));

import { RecordViewer } from "./RecordViewer";

const base: DailyRecord = { ...EMPTY_INPUT, id: "r", userId: "p1", recordDate: "2026-10-17", completedAt: null, updatedAt: "t" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function valueOf(label: string) {
  return screen.getByText(label, { selector: "dt" }).nextElementSibling!.textContent;
}

describe("RecordViewer", () => {
  it("記録の中身を出し、未入力と「しなかった」「食べていない」を区別する", async () => {
    mocks.fetchRecord.mockResolvedValue({ ...base, completedAt: "t", breakfast: "none", wentOut: false, medication: "unsure", memo: "散歩した" });
    render(<RecordViewer userId="p1" recordDate="2026-10-17" />);
    expect(await screen.findByText("✓ 完了")).toBeTruthy();
    expect(valueOf("朝食")).toBe("食べていない");
    expect(valueOf("昼食")).toBe("未入力");
    expect(valueOf("外出")).toBe("しなかった");
    expect(valueOf("買い物")).toBe("未入力");
    expect(valueOf("お薬")).toBe("わからない");
    expect(screen.getByText("散歩した")).toBeTruthy();
    expect(mocks.fetchRecord).toHaveBeenCalledWith("p1", "2026-10-17");
  });

  it("途中までの日・記録の無い日", async () => {
    mocks.fetchRecord.mockResolvedValue(base);
    render(<RecordViewer userId="p1" recordDate="2026-10-17" />);
    expect(await screen.findByText("途中まで(完了していません)")).toBeTruthy();
    cleanup();
    mocks.fetchRecord.mockResolvedValue(null);
    render(<RecordViewer userId="p1" recordDate="2026-10-16" />);
    expect(await screen.findByText("この日の記録はありません")).toBeTruthy();
    expect(screen.queryByText("朝食")).toBeNull();
  });
});
