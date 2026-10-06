import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createGroup: vi.fn(),
  createInvite: vi.fn(),
  getActiveInvite: vi.fn(),
  getGroupMembers: vi.fn(),
  getMyGroup: vi.fn(),
  joinGroupByCode: vi.fn(),
  leaveGroup: vi.fn(),
}));

vi.mock("../db/groups", () => mocks);

import { useGroupAdmin } from "./useGroupAdmin";

const GROUP = { id: "g1", name: null, created_by: "u1", created_at: "2026-09-01T00:00:00Z" };
const INVITE = {
  id: "i1",
  group_id: "g1",
  code: "ABCD1234",
  created_by: "u1",
  expires_at: "2026-09-02T00:00:00Z",
  used_at: null,
  used_by: null,
  created_at: "2026-09-01T00:00:00Z",
};

const pullFromCloud = vi.fn();
const onError = vi.fn();
const onJoined = vi.fn();

function setup(appName = "あさノート") {
  return renderHook(() => useGroupAdmin({ appName, pullFromCloud, onError, onJoined }));
}

beforeEach(() => {
  mocks.getMyGroup.mockResolvedValue(GROUP);
  mocks.getGroupMembers.mockResolvedValue([]);
  mocks.getActiveInvite.mockResolvedValue(INVITE);
  mocks.joinGroupByCode.mockResolvedValue(undefined);
  mocks.leaveGroup.mockResolvedValue(undefined);
  pullFromCloud.mockResolvedValue(undefined);
  onJoined.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  Reflect.deleteProperty(navigator, "share");
});

describe("useGroupAdmin", () => {
  it("招待の共有文に、渡されたアプリ名が入る", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    const { result } = setup("よるノート");
    await act(async () => result.current.refresh());

    await act(async () => result.current.shareInvite());

    expect(share).toHaveBeenCalledWith({
      title: "よるノート グループ招待",
      text: "よるノートのグループに招待します。招待コード: ABCD1234\n(24時間以内に入力してください)",
    });
  });

  it("共有の機能が無い端末では、クリップボードへコピーする(アプリ名入り)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { result } = setup("あさノート");
    await act(async () => result.current.refresh());

    await act(async () => result.current.shareInvite());

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("あさノートのグループに招待します。"));
    await waitFor(() => expect(result.current.shareCopied).toBe(true));
  });

  it("参加に成功したら、onJoined のあとにクラウドから取り直す", async () => {
    const { result } = setup();
    act(() => result.current.setJoinCodeInput("ABCD1234"));

    await act(async () => result.current.join());

    expect(mocks.joinGroupByCode).toHaveBeenCalledWith("ABCD1234");
    expect(onJoined).toHaveBeenCalledTimes(1);
    expect(pullFromCloud).toHaveBeenCalledTimes(1);
  });

  it("参加に失敗したら、クラウドから取り直さない", async () => {
    mocks.joinGroupByCode.mockRejectedValue(new Error("invalid code"));
    const { result } = setup();

    await act(async () => result.current.join());

    expect(pullFromCloud).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(String));
  });

  it("脱退したら、クラウドから取り直す", async () => {
    const { result } = setup();
    await act(async () => result.current.refresh());

    await act(async () => result.current.confirmLeave());

    expect(mocks.leaveGroup).toHaveBeenCalledTimes(1);
    expect(pullFromCloud).toHaveBeenCalledTimes(1);
    expect(result.current.group).toBeNull();
  });
});
