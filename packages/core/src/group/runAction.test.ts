import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAction, runSilently } from "./runAction";

const reportHandledError = vi.hoisted(() => vi.fn());
vi.mock("../clientErrors", () => ({ reportHandledError }));

beforeEach(() => reportHandledError.mockClear());

describe("runAction", () => {
  it("成功時はok:trueと戻り値を返し、onErrorは呼ばない", async () => {
    const onError = vi.fn();

    const result = await runAction(async () => "created", "失敗しました", onError);

    expect(result).toEqual({ ok: true, value: "created" });
    expect(onError).not.toHaveBeenCalled();
  });

  it("失敗時はok:falseを返し、onErrorへユーザー向けメッセージを渡す", async () => {
    const onError = vi.fn();
    const warnSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runAction(
      async () => {
        throw new Error("boom");
      },
      "処理に失敗しました",
      onError
    );

    expect(result).toEqual({ ok: false });
    expect(onError).toHaveBeenCalledWith("処理に失敗しました(boom)");
    expect(reportHandledError).toHaveBeenCalledWith("group/action", expect.any(Error));
    warnSpy.mockRestore();
  });

  it("where を渡せば、その区分で記録する", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await runAction(async () => { throw new Error("x"); }, "失敗", vi.fn(), "group/refresh");
    expect(reportHandledError).toHaveBeenCalledWith("group/refresh", expect.any(Error));
  });
});

describe("runSilently", () => {
  it("成功時は何も起きない", async () => {
    await expect(runSilently(async () => {})).resolves.toBeUndefined();
  });

  it("失敗してもconsole.errorへ記録するのみで例外を投げない", async () => {
    const warnSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      runSilently(async () => {
        throw new Error("boom");
      })
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
