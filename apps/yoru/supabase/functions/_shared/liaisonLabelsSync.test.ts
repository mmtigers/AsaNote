// @vitest-environment node
//
// liaisonInput.ts の対応表(id → 日本語)は、アプリの選択肢の定義の複製(Edge Function はアプリの src を
// 取り込めないため)。アプリ側の選択肢が変わったのに、こちらが追随しないと、AI に id のまま渡ってしまう。それを止める。
import { describe, expect, it } from "vitest";
import * as asa from "../../../../asa/src/constants/choices";
import * as yoru from "../../../src/constants/choices";
import { ASA_OUTCOME_LABELS, BAND_LABELS, DINNER_LABELS, EFFECT_LABELS, YORU_OUTCOME_LABELS } from "./liaisonInput.ts";

const toMap = (options: readonly { value: string; label: string }[]) => Object.fromEntries(options.map((o) => [o.value, o.label]));
const toPhraseMap = (options: readonly { value: string; phrase: string }[]) =>
  Object.fromEntries(options.map((o) => [o.value, o.phrase]));

describe("連絡メモの対応表が、アプリの選択肢と一致する", () => {
  it("あさノートの登校の結果", () => {
    expect(ASA_OUTCOME_LABELS).toEqual(toMap(asa.OUTCOME_OPTIONS));
  });
  it("よるノートの総合・夕食・対応の効果", () => {
    expect(YORU_OUTCOME_LABELS).toEqual(toMap(yoru.OUTCOME_OPTIONS));
    expect(DINNER_LABELS).toEqual(toMap(yoru.DINNER_OPTIONS));
    expect(EFFECT_LABELS).toEqual(toPhraseMap(yoru.EFFECT_OPTIONS));
  });
  it("節目の時間帯", () => {
    const columnOf: Record<string, string> = { arrive: "t_arrive", hwStart: "t_hw_start", bath: "t_bath", bed: "t_bed" };
    const fromApp = Object.fromEntries(
      yoru.MILESTONES.filter((m) => "bands" in m).map((m) => [
        columnOf[m.key],
        { label: m.label, bands: Object.fromEntries((m as { bands: readonly { id: string; label: string }[] }).bands.map((b) => [b.id, b.label])) },
      ])
    );
    expect(BAND_LABELS).toEqual(fromApp);
  });
});
