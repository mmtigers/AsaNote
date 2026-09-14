import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStepNavigation } from "./useStepNavigation";

function dispatchPopState(state: unknown) {
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate", { state }));
  });
}

beforeEach(() => {
  vi.spyOn(window.history, "pushState").mockImplementation(() => {});
  vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  vi.spyOn(window.history, "back").mockImplementation(() => {});
  vi.spyOn(window.history, "go").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useStepNavigation", () => {
  it("初期状態はhomeステップ", () => {
    const { result } = renderHook(() => useStepNavigation());
    expect(result.current.step).toBe("home");
    expect(result.current.stepTransition).toEqual({ direction: "forward", seq: 0 });
  });

  it("マウント時に現在の履歴エントリをhomeとして登録する", () => {
    renderHook(() => useStepNavigation());
    expect(window.history.replaceState).toHaveBeenCalledWith(expect.objectContaining({ appStep: "home" }), "");
  });

  it("goToStep(forward)でステップを進め、履歴を積む", () => {
    const { result } = renderHook(() => useStepNavigation());
    act(() => {
      result.current.goToStep("result", "forward");
    });
    expect(result.current.step).toBe("result");
    expect(result.current.stepTransition).toEqual({ direction: "forward", seq: 1 });
    expect(window.history.pushState).toHaveBeenCalledWith({ appStep: "result" }, "");
  });

  it("goToStep(backward)では履歴を積まない", () => {
    const { result } = renderHook(() => useStepNavigation());
    act(() => {
      result.current.goToStep("home", "backward");
    });
    expect(result.current.stepTransition.direction).toBe("backward");
    expect(window.history.pushState).not.toHaveBeenCalled();
  });

  it("restoreStep('reason')はresult→reasonの順に履歴を積み、アニメーションは発生させない", () => {
    const { result } = renderHook(() => useStepNavigation());
    const seqBefore = result.current.stepTransition.seq;
    act(() => {
      result.current.restoreStep("reason");
    });
    expect(result.current.step).toBe("reason");
    expect(result.current.stepTransition.seq).toBe(seqBefore);
    expect(window.history.pushState).toHaveBeenNthCalledWith(1, { appStep: "result" }, "");
    expect(window.history.pushState).toHaveBeenNthCalledWith(2, { appStep: "reason" }, "");
  });

  it("restoreStep('result')はresultの履歴のみ積む", () => {
    const { result } = renderHook(() => useStepNavigation());
    act(() => {
      result.current.restoreStep("result");
    });
    expect(window.history.pushState).toHaveBeenCalledTimes(1);
    expect(window.history.pushState).toHaveBeenCalledWith({ appStep: "result" }, "");
  });

  it("goBackはブラウザ履歴を1つ戻す", () => {
    const { result } = renderHook(() => useStepNavigation());
    act(() => {
      result.current.goBack();
    });
    expect(window.history.back).toHaveBeenCalledTimes(1);
  });

  it("goHomeはhome(depth 0)の場合、履歴移動せずbackward遷移する", () => {
    const { result } = renderHook(() => useStepNavigation());
    act(() => {
      result.current.goHome();
    });
    expect(result.current.step).toBe("home");
    expect(result.current.stepTransition.direction).toBe("backward");
    expect(window.history.go).not.toHaveBeenCalled();
  });

  it("goHomeはresult(depth 1)の場合、history.go(-1)を呼ぶ", () => {
    const { result } = renderHook(() => useStepNavigation());
    act(() => {
      result.current.goToStep("result", "forward");
    });
    act(() => {
      result.current.goHome();
    });
    expect(window.history.go).toHaveBeenCalledWith(-1);
  });

  it("goHomeはreason(depth 2)の場合、history.go(-2)を呼ぶ", () => {
    const { result } = renderHook(() => useStepNavigation());
    act(() => {
      result.current.restoreStep("reason");
    });
    act(() => {
      result.current.goHome();
    });
    expect(window.history.go).toHaveBeenCalledWith(-2);
  });

  it("popstateイベントでステップをbackward遷移させる", () => {
    const { result } = renderHook(() => useStepNavigation());
    dispatchPopState({ appStep: "result" });
    expect(result.current.step).toBe("result");
    expect(result.current.stepTransition.direction).toBe("backward");
  });

  it("popstateのstateが無ければhomeへ遷移する", () => {
    const { result } = renderHook(() => useStepNavigation());
    dispatchPopState(null);
    expect(result.current.step).toBe("home");
  });
});
