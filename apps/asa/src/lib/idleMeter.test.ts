import { describe, expect, it } from "vitest";
import { createIdleMeter } from "./idleMeter";

const T = 60_000;

describe("createIdleMeter", () => {
  it("計測を始める前は0", () => {
    expect(createIdleMeter(T).idleSeconds(1_000_000)).toBe(0);
  });

  it("操作の間隔がしきい値以内なら、放置は0", () => {
    const m = createIdleMeter(T);
    m.start(0);
    m.touch(30_000);
    m.touch(90_000); // 間隔60秒ちょうど(超えていない)
    expect(m.idleSeconds(120_000)).toBe(0);
  });

  it("しきい値を超えた間隔は、超えた分だけを放置にする", () => {
    const m = createIdleMeter(T);
    m.start(0);
    m.touch(10_000);
    m.touch(10_000 + 5 * 60_000); // 5分あいた → 4分が放置
    expect(m.idleSeconds(10_000 + 5 * 60_000)).toBe(4 * 60);
  });

  it("最後の操作から今までの間も、しきい値を超えた分は放置にする", () => {
    const m = createIdleMeter(T);
    m.start(0);
    expect(m.idleSeconds(30_000)).toBe(0);
    expect(m.idleSeconds(60_000 + 90_000)).toBe(90);
  });

  it("放置は積み上がる(複数回の中断)", () => {
    const m = createIdleMeter(T);
    m.start(0);
    m.touch(2 * 60_000); // 60秒ぶん
    m.touch(2 * 60_000 + 1_000);
    m.touch(2 * 60_000 + 1_000 + 3 * 60_000); // 120秒ぶん
    expect(m.idleSeconds(2 * 60_000 + 1_000 + 3 * 60_000)).toBe(180);
  });

  it("計測中に idleSeconds を読んでも、計測の状態は変わらない", () => {
    const m = createIdleMeter(T);
    m.start(0);
    expect(m.idleSeconds(5 * 60_000)).toBe(240);
    expect(m.idleSeconds(5 * 60_000)).toBe(240);
  });

  it("端末の時計が戻っても、負の放置にならない", () => {
    const m = createIdleMeter(T);
    m.start(100_000);
    m.touch(50_000);
    expect(m.idleSeconds(50_000)).toBe(0);
  });

  it("start で前の計測を捨て、stop 後は操作を無視して0を返す", () => {
    const m = createIdleMeter(T);
    m.start(0);
    m.touch(10 * 60_000);
    m.start(20 * 60_000);
    expect(m.idleSeconds(20 * 60_000)).toBe(0);
    m.stop();
    m.touch(60 * 60_000);
    expect(m.idleSeconds(90 * 60_000)).toBe(0);
  });
});
