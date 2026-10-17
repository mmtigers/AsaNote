import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MEAL_CHOICES } from "@/constants/choices";
import { ChoiceGroup } from "./ChoiceGroup";

afterEach(() => cleanup());

describe("ChoiceGroup", () => {
  it("選ぶと値を返し、選んだものをもう一度押すと未入力(null)に戻す", () => {
    const onChange = vi.fn();
    const { rerender } = render(<ChoiceGroup label="朝食" choices={MEAL_CHOICES} value={null} onChange={onChange} />);
    expect(screen.getByText("(未入力)")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "食べていない" }));
    expect(onChange).toHaveBeenLastCalledWith("none");

    rerender(<ChoiceGroup label="朝食" choices={MEAL_CHOICES} value="none" onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "食べていない" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByText("(未入力)")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "食べていない" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
