import { describe, expect, it } from "vitest";
import { collectMilestoneHistory, rankTimeCandidates, timeMenuOptions } from "./timeCandidates";

const DEFAULTS = ["20:00", "20:30", "21:00"];

describe("rankTimeCandidates", () => {
  it("履歴が無ければ初期の候補をそのまま返す", () => {
    expect(rankTimeCandidates(DEFAULTS, [])).toEqual(DEFAULTS);
  });

  it("よく選んだ時刻が初期の候補より優先され、時刻の昇順で返る", () => {
    const history = ["20:45", "20:45", "20:45", "20:15", "20:15", "20:30"];
    expect(rankTimeCandidates(DEFAULTS, history)).toEqual(["20:15", "20:30", "20:45"]);
  });

  it("履歴が少ないときは初期の候補で3つに埋める", () => {
    expect(rankTimeCandidates(DEFAULTS, ["20:45"])).toEqual(["20:00", "20:30", "20:45"]);
  });

  it("履歴の回数が同じなら初期の候補を先に選ぶ", () => {
    // 20:10 と 20:30 は1回ずつ。残り1枠は初期候補の先頭(20:00)が入る。
    expect(rankTimeCandidates(DEFAULTS, ["20:10", "20:30"])).toEqual(["20:00", "20:10", "20:30"]);
  });
});

describe("timeMenuOptions", () => {
  it("両端を含めて刻みで並べる", () => {
    expect(timeMenuOptions("19:30", "20:30", 15)).toEqual(["19:30", "19:45", "20:00", "20:15", "20:30"]);
  });

  it("不正な指定は空配列", () => {
    expect(timeMenuOptions("xx", "20:30", 15)).toEqual([]);
    expect(timeMenuOptions("19:30", "20:30", 0)).toEqual([]);
  });
});

describe("collectMilestoneHistory", () => {
  it("未入力を除いて指定の節目だけを集める", () => {
    const records = [{ times: { bed: "20:30" } }, { times: { bed: null } }, { times: { arrive: "15:00" } }, { times: { bed: "21:00" } }];
    expect(collectMilestoneHistory(records, "bed")).toEqual(["20:30", "21:00"]);
  });
});
