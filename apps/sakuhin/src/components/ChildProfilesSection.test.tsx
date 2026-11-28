import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ saveChildProfile: vi.fn(), createChild: vi.fn(), deleteChild: vi.fn() }));
vi.mock("@/lib/db/childProfiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/childProfiles")>()),
  saveChildProfile: mocks.saveChildProfile,
}));
vi.mock("@note/core/db/children", () => ({ createChild: mocks.createChild, deleteChild: mocks.deleteChild }));
vi.mock("@note/core/clientErrors", () => ({ reportHandledError: vi.fn() }));
vi.mock("@/lib/today", () => ({ todayString: () => "2026-11-28" }));

import { ChildProfilesSection } from "./ChildProfilesSection";
import type { ChildProfile } from "@/lib/db/childProfiles";

const hana: ChildProfile = { id: "c1", name: "はな", created_by: "me", created_at: "x", birth_date: "2021-08-20", museum_name: null };
const sota: ChildProfile = { id: "c2", name: "そうた", created_by: "partner", created_at: "y", birth_date: null, museum_name: "SOTA MUSEUM" };

function setup() {
  const onChanged = vi.fn().mockResolvedValue(undefined);
  const onError = vi.fn();
  render(<ChildProfilesSection profiles={[hana, sota]} currentUserId="me" onChanged={onChanged} onError={onError} />);
  return { onChanged, onError };
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
});
afterEach(cleanup);

describe("ChildProfilesSection", () => {
  it("館の名前(既定は「〇〇ちゃん美術館」)と、いまの年齢を出す", () => {
    setup();
    expect(screen.getByText("はなちゃん美術館 ・ いま5歳3か月")).toBeTruthy();
    expect(screen.getByText("SOTA MUSEUM ・ 誕生日は未設定")).toBeTruthy();
  });

  it("「直す」は家族の誰でも、「削除」は登録した人の子どもだけ", () => {
    setup();
    expect(screen.getAllByRole("button", { name: "直す" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "削除" })).toHaveLength(1);
  });

  it("名前・誕生日・館の名前を保存すると、一覧を読み直して編集欄を閉じる", async () => {
    mocks.saveChildProfile.mockResolvedValue(undefined);
    const { onChanged } = setup();

    fireEvent.click(screen.getAllByRole("button", { name: "直す" })[1]!);
    fireEvent.change(screen.getByLabelText(/誕生日/), { target: { value: "2019-06-03" } });
    fireEvent.change(screen.getByLabelText(/館の名前/), { target: { value: "そうたくん美術館" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mocks.saveChildProfile).toHaveBeenCalledWith(
      "c2",
      { name: "そうた", birthDate: "2019-06-03", museumName: "そうたくん美術館" },
      "2026-11-28",
    );
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
  });

  it("保存に失敗したら、編集欄を残してエラーを伝える", async () => {
    mocks.saveChildProfile.mockRejectedValue(new Error("誕生日に未来の日付は入れられません"));
    const { onChanged, onError } = setup();

    fireEvent.click(screen.getAllByRole("button", { name: "直す" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining("誕生日に未来の日付は入れられません")));
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "保存" })).toBeTruthy();
  });

  it("削除は確認の後に行い、ほかのアプリからも消えることを伝える", async () => {
    mocks.deleteChild.mockResolvedValue(undefined);
    const { onChanged } = setup();

    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    expect(mocks.deleteChild).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog").getAttribute("aria-label")).toContain("あさノート・よるノートからも削除されます");
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mocks.deleteChild).toHaveBeenCalledWith("c1");
  });

  it("お子さまを追加できる", async () => {
    mocks.createChild.mockResolvedValue({ ...hana, id: "c3", name: "ゆい" });
    const { onChanged } = setup();

    fireEvent.change(screen.getByLabelText("追加するお子さまの名前"), { target: { value: "ゆい" } });
    fireEvent.click(screen.getByRole("button", { name: "＋追加" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mocks.createChild).toHaveBeenCalledWith("ゆい");
  });
});
