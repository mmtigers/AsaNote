// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BoardApi, Concern, Rule } from "../board";
import { RulesBoardView } from "./RulesBoardView";

const rule: Rule = {
  id: "r1",
  user_id: "u1",
  child_id: null,
  title: "前の晩に持ち物をそろえる",
  started_on: "2026-11-01",
  ended_on: null,
  created_at: "2026-11-01T00:00:00Z",
};
const concern: Concern = { id: "c1", user_id: "u1", child_id: null, title: "朝の着替え", resolved_at: null, created_at: "2026-11-01T00:00:00Z" };

function fakeApi(): BoardApi {
  return {
    getRules: vi.fn(async () => [rule]),
    createRule: vi.fn(async () => {}),
    setRuleEnded: vi.fn(async () => {}),
    deleteRule: vi.fn(async () => {}),
    getConcerns: vi.fn(async () => [concern]),
    createConcern: vi.fn(async () => {}),
    setConcernResolved: vi.fn(async () => {}),
    deleteConcern: vi.fn(async () => {}),
  };
}

function renderView(api: BoardApi, signedIn = true) {
  return render(
    <RulesBoardView
      api={api}
      signedIn={signedIn}
      authLoading={false}
      childList={[]}
      authStatus={<span>auth</span>}
      rulePlaceholder="例: テスト"
      renderComparison={(r) => <p>比較:{r.id}</p>}
    />
  );
}

afterEach(cleanup);

describe("RulesBoardView", () => {
  it("未ログインでは読み込まず、ログインの案内だけを出す", () => {
    const api = fakeApi();
    renderView(api, false);
    expect(screen.getByText("ログインすると、家族で共有できます。")).toBeTruthy();
    expect(api.getRules).not.toHaveBeenCalled();
  });

  it("試したこと・検討事項を読み込み、前後比較はアプリから渡された表示を出す", async () => {
    renderView(fakeApi());
    expect(await screen.findByText("前の晩に持ち物をそろえる")).toBeTruthy();
    expect(screen.getByText("比較:r1")).toBeTruthy();
    expect(screen.getByText("朝の着替え")).toBeTruthy();
    expect(screen.getByPlaceholderText("例: テスト")).toBeTruthy();
  });

  it("試したことを登録すると、渡された api に保存して読み込み直す", async () => {
    const api = fakeApi();
    renderView(api);
    const input = await screen.findByLabelText("試したこと");
    fireEvent.change(input, { target: { value: "7時に起こす" } });
    fireEvent.click(screen.getByRole("button", { name: "試したことを登録" }));
    await waitFor(() => expect(api.createRule).toHaveBeenCalledWith(expect.objectContaining({ title: "7時に起こす", childId: null })));
    await waitFor(() => expect(api.getRules).toHaveBeenCalledTimes(2));
  });
});
