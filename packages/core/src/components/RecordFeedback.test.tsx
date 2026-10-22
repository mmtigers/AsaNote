// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RecordFeedback,
  RecordFeedbackActions,
  RecordFeedbackBody,
  type RecordFeedbackProps,
} from "./RecordFeedback";

const ME = "me";
const PARTNER = "partner";
const MEMBERS = new Map<string, string | null>([
  [ME, "taro@example.com"],
  [PARTNER, "hanako@example.com"],
]);

type Overrides = Partial<Omit<RecordFeedbackProps, "children">>;

// ボタン(右上)と本文(カードの下)を別の場所に置く、実際のカードと同じ組み立てで描画する。
function setup(overrides: Overrides = {}) {
  const props = {
    recordId: "r1",
    currentUserId: ME,
    ownerUserId: PARTNER,
    memberEmails: MEMBERS,
    reads: [],
    comments: [],
    onMarkRead: vi.fn().mockResolvedValue(undefined),
    onSaveComment: vi.fn().mockResolvedValue(true),
    onDeleteComment: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
  render(
    <RecordFeedback {...props}>
      <header data-testid="header">
        <RecordFeedbackActions />
      </header>
      <RecordFeedbackBody />
    </RecordFeedback>
  );
  return props;
}

describe("RecordFeedback", () => {
  afterEach(cleanup);

  it("disabled の間は、ボタンも本文も出さない", () => {
    setup({ disabled: true, ownerUserId: ME });
    expect(screen.queryByLabelText("読んだ")).toBeNull();
    expect(screen.queryByLabelText("コメントする")).toBeNull();
    expect(screen.queryByText("まだ読まれていません")).toBeNull();
  });

  it("Provider の外では何も出さない", () => {
    render(
      <>
        <RecordFeedbackActions />
        <RecordFeedbackBody />
      </>
    );
    expect(screen.queryByLabelText("読んだ")).toBeNull();
  });

  describe("読んだ(✅)", () => {
    it("ボタンは右上(ヘッダー)に出る", () => {
      setup();
      expect(screen.getByTestId("header").contains(screen.getByLabelText("読んだ"))).toBe(true);
      expect(screen.getByTestId("header").contains(screen.getByLabelText("コメントする"))).toBe(true);
    });

    it("未読なら押せる ✅ を出し、押すとonMarkReadを呼ぶ", () => {
      const props = setup();
      const button = screen.getByRole("button", { name: "読んだ" });
      expect(button.textContent).toBe("✅");
      fireEvent.click(button);
      expect(props.onMarkRead).toHaveBeenCalledTimes(1);
    });

    it("既読なら押せないしるし(ボタンではない)に変わり、日時は出さない", () => {
      setup({ reads: [{ recordId: "r1", userId: ME, readAt: new Date(2026, 9, 22, 8, 5).toISOString() }] });
      expect(screen.queryByRole("button", { name: "読んだ" })).toBeNull();
      expect(screen.getByRole("img", { name: "読みました" }).textContent).toBe("✅");
      expect(screen.queryByText(/8:05/)).toBeNull();
    });

    it("自分の記録にも押せる", () => {
      setup({ ownerUserId: ME });
      expect(screen.getByRole("button", { name: "読んだ" })).toBeTruthy();
    });

    it("相手が読んでいれば、名前だけを出す(日時は出さない)", () => {
      setup({
        ownerUserId: ME,
        reads: [{ recordId: "r1", userId: PARTNER, readAt: new Date(2026, 9, 22, 21, 30).toISOString() }],
      });
      expect(screen.getByText("✅ hanakoさんが読みました")).toBeTruthy();
      expect(screen.queryByText(/21:30/)).toBeNull();
      expect(screen.queryByText("まだ読まれていません")).toBeNull();
    });

    it("自分の記録を相手がまだ読んでいなければ「まだ読まれていません」を出す", () => {
      setup({ ownerUserId: ME });
      expect(screen.getByText("まだ読まれていません")).toBeTruthy();
    });

    it("クラウド未同期の自分の記録(ownerUserIdなし)も自分の記録として扱う", () => {
      setup({ ownerUserId: null });
      expect(screen.getByText("まだ読まれていません")).toBeTruthy();
    });

    it("相手の記録には「まだ読まれていません」を出さない", () => {
      setup({ ownerUserId: PARTNER });
      expect(screen.queryByText("まだ読まれていません")).toBeNull();
    });

    it("パートナーがいない(メンバーが自分だけ)なら「まだ読まれていません」を出さない", () => {
      setup({ ownerUserId: ME, memberEmails: new Map([[ME, "taro@example.com"]]) });
      expect(screen.queryByText("まだ読まれていません")).toBeNull();
    });
  });

  describe("コメント", () => {
    const partnerComment = {
      recordId: "r1",
      userId: PARTNER,
      body: "おつかれさま",
      createdAt: "2026-10-22T00:00:00Z",
      updatedAt: "2026-10-22T00:00:00Z",
    };
    const myComment = { ...partnerComment, userId: ME, body: "ありがとう" };

    it("相手のコメントは名前つきで出し、編集・削除の導線は出さない", () => {
      setup({ comments: [partnerComment] });
      expect(screen.getByText("おつかれさま")).toBeTruthy();
      expect(screen.getByText("hanakoさん:")).toBeTruthy();
      expect(screen.queryByLabelText("コメントを編集する")).toBeNull();
      expect(screen.queryByLabelText("コメントを削除する")).toBeNull();
    });

    it("右上の💬を押すと入力欄が開き、保存するとonSaveCommentを呼んで閉じる", async () => {
      const props = setup();
      expect(screen.queryByLabelText("コメント")).toBeNull();
      fireEvent.click(screen.getByLabelText("コメントする"));
      fireEvent.change(screen.getByLabelText("コメント"), { target: { value: "ありがとう" } });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));

      expect(props.onSaveComment).toHaveBeenCalledWith("ありがとう");
      await waitFor(() => expect(screen.queryByLabelText("コメント")).toBeNull());
    });

    it("入力欄はヘッダーではなく、カードの下(本文側)に出る", () => {
      setup();
      fireEvent.click(screen.getByLabelText("コメントする"));
      expect(screen.getByTestId("header").contains(screen.getByLabelText("コメント"))).toBe(false);
    });

    it("入力欄を開いている間は💬を押せない", () => {
      setup();
      fireEvent.click(screen.getByLabelText("コメントする"));
      expect((screen.getByLabelText("コメントする") as HTMLButtonElement).disabled).toBe(true);
    });

    it("空のままでは保存できない", () => {
      setup();
      fireEvent.click(screen.getByLabelText("コメントする"));
      fireEvent.change(screen.getByLabelText("コメント"), { target: { value: "   " } });
      expect((screen.getByRole("button", { name: "保存" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("保存に失敗したら入力を開いたままにする", async () => {
      const props = setup({ onSaveComment: vi.fn().mockResolvedValue(false) });
      fireEvent.click(screen.getByLabelText("コメントする"));
      fireEvent.change(screen.getByLabelText("コメント"), { target: { value: "あ" } });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));

      await waitFor(() => expect(props.onSaveComment).toHaveBeenCalled());
      expect(screen.getByLabelText("コメント")).toBeTruthy();
    });

    it("自分のコメントがあれば、✏️でも💬でも現在の本文から直せる", async () => {
      const props = setup({ comments: [myComment] });

      fireEvent.click(screen.getByLabelText("コメントを編集する"));
      const input = screen.getByLabelText("コメント") as HTMLInputElement;
      expect(input.value).toBe("ありがとう");
      fireEvent.change(input, { target: { value: "ありがとう!" } });
      fireEvent.click(screen.getByRole("button", { name: "保存" }));
      expect(props.onSaveComment).toHaveBeenCalledWith("ありがとう!");
      await waitFor(() => expect(screen.queryByLabelText("コメント")).toBeNull());

      fireEvent.click(screen.getByLabelText("コメントする"));
      expect((screen.getByLabelText("コメント") as HTMLInputElement).value).toBe("ありがとう");
    });

    it("キャンセルすると保存せずに閉じる", () => {
      const props = setup();
      fireEvent.click(screen.getByLabelText("コメントする"));
      fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
      expect(screen.queryByLabelText("コメント")).toBeNull();
      expect(props.onSaveComment).not.toHaveBeenCalled();
    });

    it("削除は確認ダイアログで確定したときだけ実行する", async () => {
      const props = setup({ comments: [myComment] });
      fireEvent.click(screen.getByLabelText("コメントを削除する"));
      expect(props.onDeleteComment).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "削除する" }));
      await waitFor(() => expect(props.onDeleteComment).toHaveBeenCalledTimes(1));
    });

    it("削除の確認でキャンセルしたら削除しない", () => {
      const props = setup({ comments: [myComment] });
      fireEvent.click(screen.getByLabelText("コメントを削除する"));
      fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
      expect(props.onDeleteComment).not.toHaveBeenCalled();
    });
  });
});
