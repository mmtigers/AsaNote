import { afterEach, describe, expect, it, vi } from "vitest";
import { describeServerError } from "./errors";

afterEach(() => vi.unstubAllGlobals());

describe("describeServerError", () => {
  it("DB の関数が返す決まった語を、日本語の案内にする", () => {
    expect(describeServerError({ message: "invite_invalid" }, "失敗")).toMatch(/招待コードが正しくないか/);
    expect(describeServerError({ message: "last_admin" }, "失敗")).toMatch(/家族管理者が誰もいなくなる/);
    expect(describeServerError({ message: "not_admin" }, "失敗")).toMatch(/家族管理者だけ/);
  });

  it("呼び名の長さの制約(check 制約名を含むメッセージ)を案内にする", () => {
    expect(
      describeServerError({ message: 'new row for relation "oya_invites" violates check constraint "oya_invites_display_name_check"' }, "失敗")
    ).toMatch(/1〜20文字/);
  });

  it("Supabase Auth のコードの誤り・期限切れ(code: otp_expired)を案内にする", () => {
    expect(describeServerError({ code: "otp_expired", message: "Token has expired or is invalid" }, "失敗")).toMatch(/コードが正しくないか/);
    expect(describeServerError(new Error("Token has expired or is invalid"), "失敗")).toMatch(/コードが正しくないか/);
  });

  it("通信エラーは通信エラーの案内にする", () => {
    expect(describeServerError(new TypeError("Failed to fetch"), "失敗")).toMatch(/通信エラー/);
  });

  it("知らないエラーは、渡した文言にする(内部の詳細は出さない)", () => {
    expect(describeServerError({ message: "something internal" }, "保存できませんでした")).toBe("保存できませんでした");
  });
});
