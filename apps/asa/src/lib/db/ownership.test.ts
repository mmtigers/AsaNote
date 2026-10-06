import { describe, expect, it } from "vitest";
import { canEditRecord, isOwnRecord } from "./ownership";

describe("isOwnRecord", () => {
  it("認証情報読み込み中は自分の記録として扱う", () => {
    // 楽観的に倒す。false にすると自分の記録に「パートナーの記録」ラベルが
    // 一瞬出たり、エクスポート対象が一時的に空になったりする。
    expect(isOwnRecord({ userId: "other" }, "me", true)).toBe(true);
  });

  it("userId未設定はクラウド未同期の自分の記録として扱う", () => {
    expect(isOwnRecord({ userId: null }, "me")).toBe(true);
  });

  it("userIdが一致すれば自分の記録", () => {
    expect(isOwnRecord({ userId: "me" }, "me")).toBe(true);
  });

  it("userIdが異なればパートナーの記録", () => {
    expect(isOwnRecord({ userId: "partner" }, "me")).toBe(false);
  });
});

describe("canEditRecord", () => {
  // #62 の回帰テスト。以前はタイムラインが isOwnRecord で編集・削除の導線を出しており、
  // authLoading 中はパートナーの記録にも「編集する」「削除する」が表示されていた。
  // 削除するとサーバーは RLS で拒否するが、ローカル(Dexie)からは消えてしまう。
  it("認証情報読み込み中はパートナーの記録を編集可にしない", () => {
    expect(canEditRecord({ userId: "partner" }, "me", true)).toBe(false);
  });

  it("認証情報読み込み中は自分の記録でも編集可にしない(所有者未確定のため)", () => {
    expect(canEditRecord({ userId: "me" }, "me", true)).toBe(false);
  });

  it("読み込み完了後は自分の記録を編集できる", () => {
    expect(canEditRecord({ userId: "me" }, "me")).toBe(true);
  });

  it("読み込み完了後もパートナーの記録は編集できない", () => {
    expect(canEditRecord({ userId: "partner" }, "me")).toBe(false);
  });

  it("userId未設定(クラウド未同期の自分の新規記録)は編集できる", () => {
    expect(canEditRecord({ userId: null }, "me")).toBe(true);
  });

  it("authLoading が false と明示された場合も所有判定に従う", () => {
    expect(canEditRecord({ userId: "partner" }, "me", false)).toBe(false);
    expect(canEditRecord({ userId: "me" }, "me", false)).toBe(true);
  });
});
