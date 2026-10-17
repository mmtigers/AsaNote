import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { statuses } = vi.hoisted(() => ({ statuses: { list: [] as { recordDate: string; completedAt: string | null }[] } }));
vi.mock("@/lib/db/records", () => ({ fetchOwnRecordStatuses: () => Promise.resolve(statuses.list) }));

import { dayState, ParentHome } from "./ParentHome";
import { addDaysToDate, todayJst } from "@/lib/jst";

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-17T03:00:00Z") }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("dayState", () => {
  it("記録が無い日・途中・完了を区別する(未記録を体調不良などとは判定しない)", () => {
    expect(dayState(undefined)).toBe("none");
    expect(dayState({ recordDate: "d", completedAt: null })).toBe("partial");
    expect(dayState({ recordDate: "d", completedAt: "t" })).toBe("completed");
  });
});

describe("ParentHome", () => {
  it("今日の記録への入口と、直近7日の状況を出す", async () => {
    const today = todayJst();
    statuses.list = [
      { recordDate: today, completedAt: "t" },
      { recordDate: addDaysToDate(today, -1), completedAt: null },
    ];
    render(<ParentHome userId="u1" />);
    const main = await screen.findByRole("link", { name: /今日の記録を見る・直す/ });
    expect(main.getAttribute("href")).toBe(`/record?date=${today}`);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(7);
    expect(items[0]!.textContent).toMatch(/今日.*✓ 完了/);
    expect(items[1]!.textContent).toMatch(/途中まで/);
    expect(items[2]!.textContent).toMatch(/未記録/);
  });
});
