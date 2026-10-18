import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_INPUT, type DailyRecord } from "@/lib/db/records";
import type { Member } from "@/lib/db/family";

const mocks = vi.hoisted(() => ({ fetchFamilyMembers: vi.fn(), fetchRecordsInRange: vi.fn() }));
vi.mock("@/lib/db/family", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/family")>()),
  fetchFamilyMembers: mocks.fetchFamilyMembers,
}));
vi.mock("@/lib/db/records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/records")>()),
  fetchRecordsInRange: mocks.fetchRecordsInRange,
}));

import { FamilyHome } from "./FamilyHome";

// 2026-10-18(日)正午(日本時間)。
const NOW = new Date("2026-10-18T03:00:00Z");
const admin: Member = { userId: "a", familyId: "f", role: "admin", displayName: "長男", joinedAt: "2026-09-01T00:00:00Z" };
const father: Member = { userId: "p1", familyId: "f", role: "parent", displayName: "父", joinedAt: "2026-09-01T00:00:00Z" };
const mother: Member = { userId: "p2", familyId: "f", role: "parent", displayName: "母", joinedAt: "2026-10-15T01:00:00Z" };

function record(userId: string, recordDate: string, patch: Partial<DailyRecord> = {}): DailyRecord {
  return { ...EMPTY_INPUT, id: `${userId}-${recordDate}`, userId, recordDate, completedAt: null, updatedAt: "t", ...patch };
}

const fatherRecords = [
  record("p1", "2026-10-18", { completedAt: "t", medication: "taken", condition: "good" }),
  record("p1", "2026-10-17", { completedAt: "t", medication: "not_taken" }),
  record("p1", "2026-10-16", { medication: "taken" }),
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  mocks.fetchFamilyMembers.mockResolvedValue([admin, father, mother]);
  mocks.fetchRecordsInRange.mockImplementation(async (userId: string) => (userId === "p1" ? fatherRecords : []));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  window.sessionStorage.clear();
});

function stat(label: string) {
  const term = screen.getAllByText(label).find((el) => el.tagName === "DT")!;
  return term.nextElementSibling!.textContent;
}

describe("FamilyHome", () => {
  it("親だけを切り替えの対象にし、最初の親の直近7日を出す", async () => {
    render(<FamilyHome />);
    const group = await screen.findByRole("group", { name: "見る人" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["父", "母"]);
    expect(within(group).getByRole("button", { name: "父" }).getAttribute("aria-pressed")).toBe("true");
    await screen.findByRole("list", { name: "日ごとの記録" });
    expect(mocks.fetchRecordsInRange).toHaveBeenCalledWith("p1", "2026-10-12", "2026-10-18");
  });

  it("「完了」「途中まで」「未記録」を区別し、集計する", async () => {
    render(<FamilyHome />);
    const list = await screen.findByRole("list", { name: "日ごとの記録" });
    const items = within(list).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toHaveLength(7);
    expect(items[0]).toMatch(/今日.*完了.*お薬: 飲んだ・体調: よい/);
    expect(items[1]).toMatch(/完了.*お薬: 飲んでいない/);
    expect(items[2]).toMatch(/途中まで/);
    expect(items[3]).toMatch(/未記録/);
    expect(stat("完了")).toBe("2日");
    expect(stat("途中まで")).toBe("1日");
    expect(stat("未記録")).toBe("4日");
    expect(stat("お薬を飲んでいない")).toBe("1日");
    expect(within(list).getAllByRole("link")[2]!.getAttribute("href")).toBe("/view?user=p1&date=2026-10-16");
  });

  it("母に切り替えると、参加する前の日は数えない", async () => {
    render(<FamilyHome />);
    fireEvent.click(await screen.findByRole("button", { name: "母" }));
    await vi.waitFor(() => expect(mocks.fetchRecordsInRange).toHaveBeenCalledWith("p2", "2026-10-12", "2026-10-18"));
    const list = await screen.findByRole("list", { name: "日ごとの記録" });
    // 10/15(参加した日)〜10/18 の4日。
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(stat("未記録")).toBe("4日");
  });

  it("月ごと・前の月に切り替えられ、選んだ状態は戻ってきたときに残る", async () => {
    const { unmount } = render(<FamilyHome />);
    fireEvent.click(await screen.findByRole("button", { name: "月ごと" }));
    await vi.waitFor(() => expect(mocks.fetchRecordsInRange).toHaveBeenCalledWith("p1", "2026-10-01", "2026-10-18"));
    fireEvent.click(screen.getByRole("button", { name: "← 前の月" }));
    await vi.waitFor(() => expect(mocks.fetchRecordsInRange).toHaveBeenCalledWith("p1", "2026-09-01", "2026-09-30"));
    expect(screen.getByRole("heading", { name: "2026年9月" })).toBeTruthy();
    unmount();

    render(<FamilyHome />);
    expect(await screen.findByRole("heading", { name: "2026年9月" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "次の月 →" }));
    expect(await screen.findByRole("heading", { name: "今月(2026年10月)" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "次の月 →" })).toBeNull();
  });

  it("親がまだいなければ、招待を案内する", async () => {
    mocks.fetchFamilyMembers.mockResolvedValue([admin]);
    render(<FamilyHome />);
    expect(await screen.findByText(/まだ親\(記録する人\)が家族に参加していません/)).toBeTruthy();
    expect(mocks.fetchRecordsInRange).not.toHaveBeenCalled();
  });

  it("記録を読めなければ案内する", async () => {
    mocks.fetchRecordsInRange.mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));
    render(<FamilyHome />);
    expect((await screen.findByRole("alert")).textContent).toBeTruthy();
  });
});
