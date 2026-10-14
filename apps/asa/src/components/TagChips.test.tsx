import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TagChips } from "./TagChips";

afterEach(() => {
  cleanup();
});

// #62 で到達不能だった単一選択の分岐(multiple=false)を撤去した際に、
// 残した複数選択の挙動が変わっていないことを固定するためのテスト。
describe("TagChips", () => {
  it("選択肢を表示し、選択状態を aria-pressed で示す", () => {
    render(<TagChips options={["ねむい", "おなかいたい"]} value={["ねむい"]} onChange={() => {}} />);

    expect(screen.getByRole("button", { name: "ねむい" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "おなかいたい" }).getAttribute("aria-pressed")).toBe(
      "false"
    );
  });

  it("未選択を押すと既存の選択に追加する(複数選択)", () => {
    const onChange = vi.fn();
    render(<TagChips options={["ねむい", "おなかいたい"]} value={["ねむい"]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "おなかいたい" }));

    expect(onChange).toHaveBeenCalledWith(["ねむい", "おなかいたい"]);
  });

  it("選択済みを押すとその1件だけ外す", () => {
    const onChange = vi.fn();
    render(
      <TagChips
        options={["ねむい", "おなかいたい"]}
        value={["ねむい", "おなかいたい"]}
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "ねむい" }));

    expect(onChange).toHaveBeenCalledWith(["おなかいたい"]);
  });

  it("onAddCustom が無ければ「＋追加」を出さない", () => {
    render(<TagChips options={["ねむい"]} value={[]} onChange={() => {}} />);

    expect(screen.queryByRole("button", { name: "+ 追加" })).toBeNull();
  });

  it("カスタムタグを追加すると onAddCustom と onChange の両方が呼ばれる", () => {
    const onChange = vi.fn();
    const onAddCustom = vi.fn();
    render(
      <TagChips options={["ねむい"]} value={["ねむい"]} onChange={onChange} onAddCustom={onAddCustom} />
    );

    fireEvent.click(screen.getByRole("button", { name: "+ 追加" }));
    const input = screen.getByPlaceholderText("自由に入力");
    fireEvent.change(input, { target: { value: "あたまいたい" } });
    fireEvent.blur(input);

    expect(onAddCustom).toHaveBeenCalledWith("あたまいたい");
    expect(onChange).toHaveBeenCalledWith(["ねむい", "あたまいたい"]);
  });

  it("空文字のカスタムタグは追加しない", () => {
    const onChange = vi.fn();
    const onAddCustom = vi.fn();
    render(<TagChips options={["ねむい"]} value={[]} onChange={onChange} onAddCustom={onAddCustom} />);

    fireEvent.click(screen.getByRole("button", { name: "+ 追加" }));
    const input = screen.getByPlaceholderText("自由に入力");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);

    expect(onAddCustom).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("既に選択済みのタグ名を入力しても重複して追加しない", () => {
    const onChange = vi.fn();
    const onAddCustom = vi.fn();
    render(
      <TagChips options={["ねむい"]} value={["ねむい"]} onChange={onChange} onAddCustom={onAddCustom} />
    );

    fireEvent.click(screen.getByRole("button", { name: "+ 追加" }));
    const input = screen.getByPlaceholderText("自由に入力");
    fireEvent.change(input, { target: { value: "ねむい" } });
    fireEvent.blur(input);

    expect(onAddCustom).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("末尾の句読点を除いて追加する", () => {
    const onChange = vi.fn();
    const onAddCustom = vi.fn();
    render(<TagChips options={["ねむい"]} value={[]} onChange={onChange} onAddCustom={onAddCustom} />);

    fireEvent.click(screen.getByRole("button", { name: "+ 追加" }));
    const input = screen.getByPlaceholderText("自由に入力");
    fireEvent.change(input, { target: { value: "あたまいたい、" } });
    fireEvent.blur(input);

    expect(onAddCustom).toHaveBeenCalledWith("あたまいたい");
    expect(onChange).toHaveBeenCalledWith(["あたまいたい"]);
  });

  it("句読点を除くと既存の選択肢と同じになるときは、新しいタグを作らず既存を選ぶ", () => {
    const onChange = vi.fn();
    const onAddCustom = vi.fn();
    render(<TagChips options={["ねむい"]} value={[]} onChange={onChange} onAddCustom={onAddCustom} />);

    fireEvent.click(screen.getByRole("button", { name: "+ 追加" }));
    const input = screen.getByPlaceholderText("自由に入力");
    fireEvent.change(input, { target: { value: "ねむい。" } });
    fireEvent.blur(input);

    expect(onAddCustom).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(["ねむい"]);
  });

  it("句読点だけの入力は追加しない", () => {
    const onChange = vi.fn();
    const onAddCustom = vi.fn();
    render(<TagChips options={["ねむい"]} value={[]} onChange={onChange} onAddCustom={onAddCustom} />);

    fireEvent.click(screen.getByRole("button", { name: "+ 追加" }));
    const input = screen.getByPlaceholderText("自由に入力");
    fireEvent.change(input, { target: { value: "、。" } });
    fireEvent.blur(input);

    expect(onAddCustom).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("入力欄は20文字までで、メモ欄への案内を出す", () => {
    render(<TagChips options={[]} value={[]} onChange={() => {}} onAddCustom={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "+ 追加" }));

    expect(screen.getByPlaceholderText("自由に入力").getAttribute("maxlength")).toBe("20");
    expect(screen.getByText("20文字まで。長い内容はメモ欄に書いてね")).toBeTruthy();
  });
});
