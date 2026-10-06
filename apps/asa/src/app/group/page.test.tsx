// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock はファイル先頭へ巻き上げられるため、モック関数は vi.hoisted() で用意する。
const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  getMyGroup: vi.fn(),
  getGroupMembers: vi.fn(),
  getActiveInvite: vi.fn(),
  createGroup: vi.fn(),
  createInvite: vi.fn(),
  joinGroupByCode: vi.fn(),
  leaveGroup: vi.fn(),
  getChildren: vi.fn(),
  createChild: vi.fn(),
  updateChild: vi.fn(),
  deleteChild: vi.fn(),
  pullFromCloud: vi.fn(),
}));

vi.mock("@note/core/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@note/core/db/groups", () => ({
  getMyGroup: mocks.getMyGroup,
  getGroupMembers: mocks.getGroupMembers,
  getActiveInvite: mocks.getActiveInvite,
  createGroup: mocks.createGroup,
  createInvite: mocks.createInvite,
  joinGroupByCode: mocks.joinGroupByCode,
  leaveGroup: mocks.leaveGroup,
}));
vi.mock("@note/core/db/children", () => ({
  getChildren: mocks.getChildren,
  createChild: mocks.createChild,
  updateChild: mocks.updateChild,
  deleteChild: mocks.deleteChild,
}));
vi.mock("@/lib/db/sync", () => ({ pullFromCloud: mocks.pullFromCloud }));

import GroupPage from "./page";

const ME = "user-me";
const SESSION = { user: { id: ME } } as never;

const GROUP = { id: "g1", name: null, created_by: ME, created_at: "2026-09-01T00:00:00Z" };
const INVITE = {
  id: "i1",
  group_id: "g1",
  code: "ABCD1234",
  created_by: ME,
  expires_at: "2026-09-02T00:00:00Z",
  used_at: null,
  used_by: null,
  created_at: "2026-09-01T00:00:00Z",
};
const child = (id: string, name: string) => ({
  id,
  name,
  created_by: ME,
  created_at: "2026-09-01T00:00:00Z",
});

// 画面が期待する既定の応答。個々のテストで必要な分だけ上書きする。
function setupSignedIn({ group = null as typeof GROUP | null, children = [] as ReturnType<typeof child>[] } = {}) {
  mocks.useAuth.mockReturnValue({ session: SESSION, loading: false });
  mocks.getMyGroup.mockResolvedValue(group);
  mocks.getGroupMembers.mockResolvedValue([]);
  mocks.getActiveInvite.mockResolvedValue(null);
  mocks.getChildren.mockResolvedValue(children);
}

beforeEach(() => {
  // 実装が失敗経路で console.error を呼ぶので、テスト出力を汚さないよう抑える
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.pullFromCloud.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("GroupPage: 表示の分岐", () => {
  it("認証情報の読み込み中はフェッチせずスケルトンを出す", () => {
    mocks.useAuth.mockReturnValue({ session: null, loading: true });

    render(<GroupPage />);

    expect(screen.queryByRole("heading", { name: "家族との共有" })).toBeNull();
    expect(mocks.getMyGroup).not.toHaveBeenCalled();
  });

  it("未ログインならログインへの導線だけを出す", async () => {
    mocks.useAuth.mockReturnValue({ session: null, loading: false });

    render(<GroupPage />);

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "ログインする" })).toBeTruthy()
    );
    expect(screen.queryByPlaceholderText("お子さまの名前")).toBeNull();
    expect(mocks.getMyGroup).not.toHaveBeenCalled();
  });

  it("グループ未所属なら作成と参加の両方を出す", async () => {
    setupSignedIn();

    render(<GroupPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: "グループを作る" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "参加する" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "グループを抜ける" })).toBeNull();
  });

  it("グループ所属ならメンバーと招待コードを出し、自分に「あなた」を付ける", async () => {
    setupSignedIn({ group: GROUP });
    mocks.getGroupMembers.mockResolvedValue([
      { user_id: ME, email: "me@example.com", joined_at: "2026-09-01T00:00:00Z" },
      { user_id: "other", email: "partner@example.com", joined_at: "2026-09-01T00:00:00Z" },
    ]);
    mocks.getActiveInvite.mockResolvedValue(INVITE);

    render(<GroupPage />);

    await waitFor(() => expect(screen.getByText("me@example.com")).toBeTruthy());
    const rows = screen.getAllByRole("listitem");
    expect(rows.find((row) => row.textContent?.includes("me@example.com"))?.textContent).toContain(
      "あなた"
    );
    expect(
      rows.find((row) => row.textContent?.includes("partner@example.com"))?.textContent
    ).not.toContain("あなた");
    expect(screen.getByText("ABCD1234")).toBeTruthy();
  });

  it("初回取得に失敗してもエラー表示付きで画面自体は使える", async () => {
    mocks.useAuth.mockReturnValue({ session: SESSION, loading: false });
    mocks.getMyGroup.mockRejectedValue(new Error("boom"));
    mocks.getGroupMembers.mockResolvedValue([]);
    mocks.getActiveInvite.mockResolvedValue(null);
    mocks.getChildren.mockResolvedValue([]);

    render(<GroupPage />);

    await waitFor(() => expect(screen.getByText(/共有設定の取得に失敗しました/)).toBeTruthy());
    expect(screen.getByRole("button", { name: "グループを作る" })).toBeTruthy();
  });
});

describe("GroupPage: お子さま", () => {
  it("追加すると一覧に反映され、入力欄が空に戻る", async () => {
    setupSignedIn();
    mocks.createChild.mockResolvedValue(child("c1", "はなこ"));

    render(<GroupPage />);
    await waitFor(() => expect(screen.getByPlaceholderText("お子さまの名前")).toBeTruthy());

    const input = screen.getByPlaceholderText("お子さまの名前") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "はなこ" } });
    fireEvent.click(screen.getByRole("button", { name: "＋追加" }));

    await waitFor(() => expect(screen.getByText("はなこ")).toBeTruthy());
    expect(mocks.createChild).toHaveBeenCalledWith("はなこ");
    expect(input.value).toBe("");
  });

  it("名前が空白だけなら追加ボタンを押せない", async () => {
    setupSignedIn();

    render(<GroupPage />);
    await waitFor(() => expect(screen.getByPlaceholderText("お子さまの名前")).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText("お子さまの名前"), { target: { value: "   " } });

    expect((screen.getByRole("button", { name: "＋追加" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("追加に失敗したらエラーを出し、入力を消さない", async () => {
    setupSignedIn();
    mocks.createChild.mockRejectedValue(new Error("boom"));

    render(<GroupPage />);
    await waitFor(() => expect(screen.getByPlaceholderText("お子さまの名前")).toBeTruthy());

    const input = screen.getByPlaceholderText("お子さまの名前") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "はなこ" } });
    fireEvent.click(screen.getByRole("button", { name: "＋追加" }));

    await waitFor(() => expect(screen.getByText(/お子さまの追加に失敗しました/)).toBeTruthy());
    expect(input.value).toBe("はなこ");
  });

  it("名前を変えると一覧が更新され、編集欄が閉じる", async () => {
    setupSignedIn({ children: [child("c1", "はなこ")] });
    mocks.updateChild.mockResolvedValue(child("c1", "花子"));

    render(<GroupPage />);
    await waitFor(() => expect(screen.getByText("はなこ")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "名前を変える" }));
    fireEvent.change(screen.getByLabelText("お子さまの名前"), { target: { value: "花子" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.getByText("花子")).toBeTruthy());
    expect(mocks.updateChild).toHaveBeenCalledWith("c1", "花子");
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
  });

  it("キャンセルすると編集内容を捨てて元の表示に戻る", async () => {
    setupSignedIn({ children: [child("c1", "はなこ")] });

    render(<GroupPage />);
    await waitFor(() => expect(screen.getByText("はなこ")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "名前を変える" }));
    fireEvent.change(screen.getByLabelText("お子さまの名前"), { target: { value: "花子" } });
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(screen.getByText("はなこ")).toBeTruthy();
    expect(mocks.updateChild).not.toHaveBeenCalled();
  });

  it("削除は確認ダイアログを経てから実行される", async () => {
    setupSignedIn({ children: [child("c1", "はなこ")] });
    mocks.deleteChild.mockResolvedValue(undefined);

    render(<GroupPage />);
    await waitFor(() => expect(screen.getByText("はなこ")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    expect(mocks.deleteChild).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog").getAttribute("aria-label")).toContain("はなこさんを削除");

    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    await waitFor(() => expect(screen.queryByText("はなこ")).toBeNull());
    expect(mocks.deleteChild).toHaveBeenCalledWith("c1");
  });

  it("削除確認をキャンセルすれば消えない", async () => {
    setupSignedIn({ children: [child("c1", "はなこ")] });

    render(<GroupPage />);
    await waitFor(() => expect(screen.getByText("はなこ")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(screen.getByText("はなこ")).toBeTruthy();
    expect(mocks.deleteChild).not.toHaveBeenCalled();
  });
});

describe("GroupPage: グループ操作", () => {
  it("作成すると招待コードの発行まで続けて行う", async () => {
    setupSignedIn();
    mocks.createGroup.mockResolvedValue(GROUP);
    mocks.createInvite.mockResolvedValue(INVITE);

    render(<GroupPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "グループを作る" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "グループを作る" }));

    await waitFor(() => expect(screen.getByText("ABCD1234")).toBeTruthy());
    expect(mocks.createInvite).toHaveBeenCalledWith("g1");
  });

  it("作成できても招待コードの発行に失敗したら案内を出す(グループ自体は残す)", async () => {
    setupSignedIn();
    mocks.createGroup.mockResolvedValue(GROUP);
    mocks.createInvite.mockRejectedValue(new Error("boom"));

    render(<GroupPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "グループを作る" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "グループを作る" }));

    await waitFor(() =>
      expect(screen.getByText(/招待コードの発行に失敗しました/)).toBeTruthy()
    );
    expect(screen.getByRole("button", { name: "招待コードを発行する" })).toBeTruthy();
  });

  it("参加に成功したらクラウドから引き直す", async () => {
    setupSignedIn();
    mocks.joinGroupByCode.mockResolvedValue(undefined);

    render(<GroupPage />);
    await waitFor(() => expect(screen.getByPlaceholderText("招待コードを入力")).toBeTruthy());

    const input = screen.getByPlaceholderText("招待コードを入力") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "ABCD1234" } });
    fireEvent.click(screen.getByRole("button", { name: "参加する" }));

    await waitFor(() => expect(mocks.pullFromCloud).toHaveBeenCalled());
    expect(mocks.joinGroupByCode).toHaveBeenCalledWith("ABCD1234");
    // 参加後は refresh() が走り、成功した入力は消える
    expect(mocks.getMyGroup).toHaveBeenCalledTimes(2);
    expect(input.value).toBe("");
  });

  it("参加に失敗したら入力を残したままエラーを出す", async () => {
    setupSignedIn();
    mocks.joinGroupByCode.mockRejectedValue(new Error("boom"));

    render(<GroupPage />);
    await waitFor(() => expect(screen.getByPlaceholderText("招待コードを入力")).toBeTruthy());

    const input = screen.getByPlaceholderText("招待コードを入力") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "WRONG" } });
    fireEvent.click(screen.getByRole("button", { name: "参加する" }));

    await waitFor(() => expect(screen.getByText(/参加に失敗しました/)).toBeTruthy());
    expect(input.value).toBe("WRONG");
    expect(mocks.pullFromCloud).not.toHaveBeenCalled();
  });

  it("グループを抜けるのも確認ダイアログを経てから実行される", async () => {
    setupSignedIn({ group: GROUP });
    mocks.leaveGroup.mockResolvedValue(undefined);

    render(<GroupPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "グループを抜ける" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "グループを抜ける" }));
    expect(mocks.leaveGroup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "抜ける" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "グループを作る" })).toBeTruthy());
    expect(mocks.leaveGroup).toHaveBeenCalled();
    expect(mocks.pullFromCloud).toHaveBeenCalled();
  });
});

describe("GroupPage: 招待コードの共有", () => {
  it("navigator.share があればそちらを使う", async () => {
    setupSignedIn({ group: GROUP });
    mocks.getActiveInvite.mockResolvedValue(INVITE);
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });

    render(<GroupPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "共有する" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "共有する" }));

    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining("ABCD1234") })
    );
    Reflect.deleteProperty(navigator, "share");
  });

  it("share が無ければクリップボードへコピーし、その旨を短く出す", async () => {
    setupSignedIn({ group: GROUP });
    mocks.getActiveInvite.mockResolvedValue(INVITE);
    Reflect.deleteProperty(navigator, "share");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<GroupPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "共有する" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "共有する" }));

    await waitFor(() => expect(screen.getByText("コピーしました")).toBeTruthy());
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("ABCD1234"));
  });

  // 非セキュアコンテキストや権限拒否で writeText が reject する経路。
  // 以前は未処理の拒否になり、ユーザーには何も起きていないように見えていた。
  it("クリップボードが使えなければ手動で控える案内を出す", async () => {
    setupSignedIn({ group: GROUP });
    mocks.getActiveInvite.mockResolvedValue(INVITE);
    Reflect.deleteProperty(navigator, "share");
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });

    render(<GroupPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "共有する" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "共有する" }));

    await waitFor(() =>
      expect(screen.getByText(/招待コードをコピーできませんでした/)).toBeTruthy()
    );
  });

  it("「新しく発行する」で招待コードを再発行する", async () => {
    setupSignedIn({ group: GROUP });
    mocks.getActiveInvite.mockResolvedValue(INVITE);
    mocks.createInvite.mockResolvedValue({ ...INVITE, id: "i2", code: "ZZZZ9999" });

    render(<GroupPage />);
    await waitFor(() => expect(screen.getByText("ABCD1234")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "新しく発行する" }));

    await waitFor(() => expect(screen.getByText("ZZZZ9999")).toBeTruthy());
    expect(mocks.createInvite).toHaveBeenCalledWith("g1");
  });
});
