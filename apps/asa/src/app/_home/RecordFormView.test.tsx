import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordFormView } from "./RecordFormView";

afterEach(() => {
  cleanup();
});

function setup(overrides: Partial<Parameters<typeof RecordFormView>[0]> = {}) {
  const onSave = vi.fn();
  render(
    <RecordFormView
      date="2026-10-14"
      isTodaySelected
      outcome="smooth"
      onSelectOutcome={() => {}}
      reasonOptions={[]}
      reasonTags={[]}
      onReasonTagsChange={() => {}}
      onAddCustomReasonTag={() => {}}
      wakeTime="06:59"
      onWakeTimeChange={() => {}}
      departTime="07:59"
      onDepartTimeChange={() => {}}
      memo=""
      onMemoChange={() => {}}
      preview=""
      loaded
      saveError={null}
      onSave={onSave}
      {...overrides}
    />
  );
  return onSave;
}

const saveButton = () => screen.getByRole("button", { name: "✓ この日の記録を保存する" });

describe("RecordFormView の保存前の確認", () => {
  it("平日で起床・出発が入っていれば、確認なしでそのまま保存する", () => {
    const onSave = setup();
    fireEvent.click(saveButton());
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("起床時刻が未入力なら、1回目の押下では保存せず確認を出し、「このまま保存する」で保存する", () => {
    const onSave = setup({ wakeTime: "" });

    fireEvent.click(saveButton());
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("・起床時刻が未入力です。")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "このまま保存する" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("「入力にもどる」で確認を閉じ、保存ボタンに戻る", () => {
    const onSave = setup({ departTime: "" });

    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole("button", { name: "入力にもどる" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByText("・出発時刻が未入力です。")).toBeNull();
    expect(saveButton()).toBeTruthy();
  });

  it("日曜日の記録は、登校のない日として確認する", () => {
    const onSave = setup({ date: "2026-10-11" });

    fireEvent.click(saveButton());

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/10月11日\(日\)は日曜日です/)).toBeTruthy();
  });

  it("行かなかった日は、出発時刻が未入力でも確認しない", () => {
    const onSave = setup({ outcome: "absent", departTime: "" });
    fireEvent.click(saveButton());
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
