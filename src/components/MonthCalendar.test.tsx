/**
 * Issue #4: 傾向タブでも同じカレンダーを使えるよう、日付選択なし(読み取り専用)の
 * モードを足した。ホーム画面の記録フローと共有しているコンポーネントなので、
 * 「日付を選べる側」の挙動が変わっていないことも併せて固定する。
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MonthCalendar } from "./MonthCalendar";
import type { Outcome } from "@/constants/choices";

afterEach(() => {
  cleanup();
});

const statusByDate = new Map<string, Outcome | null>([
  ["2026-09-14", "calm"],
  ["2026-09-15", "rough"],
  ["2026-09-16", null],
]);

describe("MonthCalendar(日付を選べるモード)", () => {
  it("日セルがボタンになり、押すとその日付を返す", () => {
    const onSelectDate = vi.fn();
    render(
      <MonthCalendar
        year={2026}
        month={9}
        todayValue="2026-09-14"
        statusByDate={statusByDate}
        onMonthChange={() => {}}
        selectedDate="2026-09-14"
        onSelectDate={onSelectDate}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "15" }));

    expect(onSelectDate).toHaveBeenCalledWith("2026-09-15");
  });

  it("別の月を見ているときの「今日」で今日の日付に戻す", () => {
    const onSelectDate = vi.fn();
    render(
      <MonthCalendar
        year={2026}
        month={8}
        todayValue="2026-09-14"
        statusByDate={undefined}
        onMonthChange={() => {}}
        selectedDate="2026-08-01"
        onSelectDate={onSelectDate}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "今日" }));

    expect(onSelectDate).toHaveBeenCalledWith("2026-09-14");
  });
});

describe("MonthCalendar(読み取り専用モード)", () => {
  it("日セルをボタンにしない(押しても何も起きないため)", () => {
    render(
      <MonthCalendar
        year={2026}
        month={9}
        todayValue="2026-09-14"
        statusByDate={statusByDate}
        onMonthChange={() => {}}
      />
    );

    expect(screen.queryByRole("button", { name: "15" })).toBeNull();
    // 日付自体は表示されている(色分けの土台)。
    expect(screen.getByText("15")).toBeTruthy();
    // 残るボタンは前月・次月の2つだけ(今月を表示中なので「今月」ボタンは出ない)。
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("別の月を見ているときの「今月」で今月の表示に戻す(日付は選ばない)", () => {
    const onMonthChange = vi.fn();
    render(
      <MonthCalendar
        year={2026}
        month={7}
        todayValue="2026-09-14"
        statusByDate={undefined}
        onMonthChange={onMonthChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "今月" }));

    expect(onMonthChange).toHaveBeenCalledWith(2026, 9);
  });

  it("前の月・次の月へ移動できる", () => {
    const onMonthChange = vi.fn();
    render(
      <MonthCalendar
        year={2026}
        month={1}
        todayValue="2026-01-14"
        statusByDate={undefined}
        onMonthChange={onMonthChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "前の月" }));
    expect(onMonthChange).toHaveBeenCalledWith(2025, 12);

    fireEvent.click(screen.getByRole("button", { name: "次の月" }));
    expect(onMonthChange).toHaveBeenCalledWith(2026, 2);
  });
});
