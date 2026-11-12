import { describe, expect, it } from "vitest";
import {
  countChars,
  currentMemo,
  formatPeriod,
  historyBody,
  jstToday,
  memoBody,
  noticeMemo,
  shouldShowNotice,
  upcomingDueDate,
  type LiaisonMemo,
} from "./liaisonMemo";

const memo = (over: Partial<LiaisonMemo> = {}): LiaisonMemo => ({
  id: "m1",
  childId: "c1",
  dueDate: "2026-11-12",
  status: "generated",
  error: null,
  draftText: "下書き",
  editedText: null,
  contactDraftText: null,
  contactEditedText: null,
  finalText: null,
  sentAt: null,
  sentBy: null,
  regenerateCount: 0,
  asaFrom: "2026-11-06",
  asaTo: "2026-11-12",
  yoruFrom: "2026-11-05",
  yoruTo: "2026-11-11",
  ...over,
});

// 2026-11-12 は木曜日。
const THU_NOON = new Date("2026-11-12T03:00:00Z");

describe("日付", () => {
  it("jstToday は日本時間の日付", () => {
    expect(jstToday(new Date("2026-11-11T15:00:00Z"))).toBe("2026-11-12");
  });
  it("upcomingDueDate は今日以降で最も近い設定の曜日", () => {
    expect(upcomingDueDate(THU_NOON, 4)).toBe("2026-11-12");
    expect(upcomingDueDate(new Date("2026-11-13T03:00:00Z"), 4)).toBe("2026-11-19");
  });
  it("currentMemo は予定日ちょうどの行", () => {
    expect(currentMemo([memo({ dueDate: "2026-11-05" }), memo()], THU_NOON, 4)?.dueDate).toBe("2026-11-12");
    expect(currentMemo([memo({ dueDate: "2026-11-05" })], THU_NOON, 4)).toBeNull();
  });
});

describe("本文", () => {
  it("編集があれば編集、無ければ下書き。履歴は最終版を優先", () => {
    expect(memoBody(memo())).toBe("下書き");
    expect(memoBody(memo({ editedText: "編集" }))).toBe("編集");
    expect(historyBody(memo({ editedText: "編集", finalText: "最終" }))).toBe("最終");
  });
  it("countChars は改行・空白を除く", () => {
    expect(countChars("あ い\nう")).toBe(3);
  });
  it("formatPeriod", () => {
    expect(formatPeriod("2026-11-06", "2026-11-12")).toBe("11/6〜11/12");
    expect(formatPeriod(null, "2026-11-12")).toBeNull();
  });
});

describe("お知らせカード", () => {
  it("下書きがあって送っていない回を、予定日から6日後まで出す", () => {
    expect(shouldShowNotice(memo(), THU_NOON)).toBe(true);
    expect(shouldShowNotice(memo(), new Date("2026-11-18T03:00:00Z"))).toBe(true);
    expect(shouldShowNotice(memo(), new Date("2026-11-19T03:00:00Z"))).toBe(false);
  });
  it("送った回・記録なしの回は出さない。失敗した回は出す", () => {
    expect(shouldShowNotice(memo({ sentAt: "2026-11-12T12:00:00Z" }), THU_NOON)).toBe(false);
    expect(shouldShowNotice(memo({ status: "no_records" }), THU_NOON)).toBe(false);
    expect(shouldShowNotice(memo({ status: "failed" }), THU_NOON)).toBe(true);
  });
  it("予定日より前に「今すぐ作る」で作った回は、予定日まで出さない", () => {
    expect(shouldShowNotice(memo(), new Date("2026-11-10T03:00:00Z"))).toBe(false);
  });
  it("noticeMemo は新しい回を優先する", () => {
    const older = memo({ id: "old", dueDate: "2026-11-05" });
    expect(noticeMemo([older, memo()], THU_NOON)?.id).toBe("m1");
  });
});
