// @vitest-environment node
import { describe, expect, it } from "vitest";
import { belongsToChild, buildUserContent, describeAsaRecord, describeYoruRecord, maskNames } from "./liaisonInput.ts";

const TOMO = { id: "c1", name: "ともや" };
const SIS = { id: "c2", name: "とも" };

describe("belongsToChild(未分類の扱い)", () => {
  it("その子の記録は使う", () => {
    expect(belongsToChild("c1", "c1", 2)).toBe(true);
  });
  it("未分類は、子どもが1人のときだけ使う", () => {
    expect(belongsToChild(null, "c1", 1)).toBe(true);
    expect(belongsToChild(null, "c1", 2)).toBe(false);
  });
  it("ほかの子の記録は使わない", () => {
    expect(belongsToChild("c2", "c1", 2)).toBe(false);
  });
});

describe("maskNames", () => {
  it("対象の子は「本人」、ほかの子は「きょうだい」。長い名前から置き換える", () => {
    expect(maskNames("ともやととも", [SIS, TOMO], "c1")).toBe("本人ときょうだい");
  });
});

describe("describeAsaRecord", () => {
  const record = {
    record_date: "2026-11-10",
    outcome: "reluctant",
    wake_time: "07:05:00",
    trigger_tags: ["課題"],
    handoff: "なし",
    condition_scale: 2,
    memo: "ともやが遅刻",
  };
  it("id を日本語にし、親の体調(condition_scale)は渡さない", () => {
    const lines = describeAsaRecord(record, true);
    expect(lines).toContain("登校: 行き渋った");
    expect(lines).toContain("起床: 07:05");
    expect(lines).toContain("きっかけ: 課題");
    expect(lines.join()).not.toMatch(/引き渡し|体調|2/);
  });
  it("メモ欄を使わない設定なら、メモを渡さない", () => {
    expect(describeAsaRecord(record, false).join()).not.toContain("メモ");
  });
});

describe("describeYoruRecord", () => {
  it("総合・節目の時間帯・夕食・対応の効果を日本語にする", () => {
    const lines = describeYoruRecord(
      { outcome: "storm", t_bed: "late", t_arrive: "14:45", dinner: "little", response_effect: "good", behavior_tags: ["号泣"] },
      true
    );
    expect(lines).toContain("夜の様子: 大荒れ");
    expect(lines).toContain("節目: 帰宅 14:45、消灯 21時以降");
    expect(lines).toContain("夕食: 少し");
    expect(lines).toContain("対応の効果: 効いた");
    expect(lines).toContain("行動: 号泣");
  });
});

describe("buildUserContent", () => {
  const source = {
    asaRecords: [{ record_date: "2026-11-10", outcome: "smooth", memo: "ともやは元気" }],
    yoruRecords: [{ record_date: "2026-11-09", outcome: "calm", memo: "とももご機嫌" }],
    rules: [{ title: "18時までにお風呂", started_on: "2026-11-01", ended_on: null }],
    concerns: [{ title: "運動会の音が苦手" }],
    styleExamples: ["ともやは毎日登校できました。"],
  };
  const settings = { targetChars: 80, recipientLabel: "療育先", includeMemo: true };

  it("日付順に並べ、名前を伏せ、試したこと・検討事項・見本・追加の希望を含める", () => {
    const text = buildUserContent(source, settings, [TOMO, SIS], "c1", "もっと短く");
    expect(text.indexOf("## 2026-11-09")).toBeLessThan(text.indexOf("## 2026-11-10"));
    expect(text).not.toMatch(/ともや|とも(?!だち)/);
    expect(text).toContain("本人は元気");
    expect(text).toContain("きょうだいもご機嫌");
    expect(text).toContain("18時までにお風呂");
    expect(text).toContain("運動会の音が苦手");
    expect(text).toContain("本人は毎日登校できました。");
    expect(text).toContain("今回の追加の希望: もっと短く");
    expect(text).toContain("80字程度");
  });
});
