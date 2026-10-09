import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createResumePuller, RESUME_PULL_INTERVAL_MS } from "./pullOnResume";

const START = new Date("2026-10-09T09:00:00+09:00");
const pull = vi.fn();
const isSignedIn = vi.fn();
let online = true;
let visibility: DocumentVisibilityState = "visible";

function makePuller() {
  return createResumePuller({ pull, isSignedIn });
}

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  pull.mockReset().mockResolvedValue(undefined);
  isSignedIn.mockReset().mockResolvedValue(true);
  online = true;
  visibility = "visible";
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createResumePuller.pullIfStale", () => {
  it("前回の取り込みから5分未満なら、取り込まない", async () => {
    const puller = makePuller();
    puller.markPulled();
    vi.advanceTimersByTime(RESUME_PULL_INTERVAL_MS - 1);

    expect(await puller.pullIfStale()).toBe(false);
    expect(pull).not.toHaveBeenCalled();
  });

  it("前回の取り込みから5分以上なら、取り込む", async () => {
    const puller = makePuller();
    puller.markPulled();
    vi.advanceTimersByTime(RESUME_PULL_INTERVAL_MS);

    expect(await puller.pullIfStale()).toBe(true);
    expect(pull).toHaveBeenCalledTimes(1);
  });

  it("取り込んだ直後は、時刻が更新されるので、すぐには取り込まない", async () => {
    const puller = makePuller();
    expect(await puller.pullIfStale()).toBe(true);
    vi.advanceTimersByTime(60 * 1000);

    expect(await puller.pullIfStale()).toBe(false);
    expect(pull).toHaveBeenCalledTimes(1);
  });

  it("まだ一度も取り込んでいなければ、取り込む", async () => {
    expect(await makePuller().pullIfStale()).toBe(true);
  });

  it("未ログインでは取り込まない", async () => {
    isSignedIn.mockResolvedValue(false);

    expect(await makePuller().pullIfStale()).toBe(false);
    expect(pull).not.toHaveBeenCalled();
  });

  it("オフラインでは取り込まない", async () => {
    online = false;

    expect(await makePuller().pullIfStale()).toBe(false);
    expect(pull).not.toHaveBeenCalled();
    expect(isSignedIn).not.toHaveBeenCalled();
  });

  it("実行中は二重に取り込まない", async () => {
    let finish: () => void = () => {};
    pull.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const puller = makePuller();

    const first = puller.pullIfStale();
    // 間隔が空いていても、実行中なら無視する。
    vi.advanceTimersByTime(RESUME_PULL_INTERVAL_MS * 2);
    expect(await puller.pullIfStale()).toBe(false);

    finish();
    expect(await first).toBe(true);
    expect(pull).toHaveBeenCalledTimes(1);
  });

  it("取り込みが失敗しても、エラーを投げず、警告のログだけ出す", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    pull.mockRejectedValue(new Error("network"));

    await expect(makePuller().pullIfStale()).resolves.toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("失敗したあとも、実行中の状態は残らない(次の機会に取り込める)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    pull.mockRejectedValueOnce(new Error("network"));
    const puller = makePuller();
    await puller.pullIfStale();
    vi.advanceTimersByTime(RESUME_PULL_INTERVAL_MS);

    expect(await puller.pullIfStale()).toBe(true);
  });

  it("ログイン状態の確認が失敗しても、エラーを投げない", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    isSignedIn.mockRejectedValue(new Error("env missing"));

    await expect(makePuller().pullIfStale()).resolves.toBe(false);
    expect(pull).not.toHaveBeenCalled();
  });
});

describe("createResumePuller.register", () => {
  it("前面に戻ったとき(visible)に判定する。隠れたとき(hidden)は何もしない", async () => {
    const off = makePuller().register();

    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(0);
    expect(pull).not.toHaveBeenCalled();

    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(pull).toHaveBeenCalledTimes(1);
    off();
  });

  it("二重に登録しても、リスナーは1つだけ", async () => {
    const puller = makePuller();
    const off1 = puller.register();
    const off2 = puller.register();

    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(pull).toHaveBeenCalledTimes(1);
    off1();
    off2();
  });

  it("解除すると取り込まない。解除後にもう一度登録できる", async () => {
    const puller = makePuller();
    puller.register()();

    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(pull).not.toHaveBeenCalled();

    const off = puller.register();
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(pull).toHaveBeenCalledTimes(1);
    off();
  });
});
