import { describe, expect, it } from "vitest";
import { DEFAULT_LIAISON_SETTINGS } from "@/lib/liaisonMemo";
import { consentKey, unseenConsents } from "./LiaisonMemoNotice";

const s = (over = {}) => ({ childId: "c1", ...DEFAULT_LIAISON_SETTINGS, enabled: true, consentedBy: "uB", consentedAt: "2026-11-01T00:00:00Z", ...over });

describe("unseenConsents(家族がオンにしたことのお知らせ)", () => {
  it("ほかの人がオンにして、まだ知らせていないものだけ", () => {
    expect(unseenConsents([s()], "uA", [])).toHaveLength(1);
    expect(unseenConsents([s({ consentedBy: "uA" })], "uA", [])).toHaveLength(0);
    expect(unseenConsents([s()], "uA", [consentKey(s())])).toHaveLength(0);
    expect(unseenConsents([s({ enabled: false })], "uA", [])).toHaveLength(0);
  });
  it("一度オフにして、またオンにしたら、もう一度知らせる", () => {
    const again = s({ consentedAt: "2026-11-20T00:00:00Z" });
    expect(unseenConsents([again], "uA", [consentKey(s())])).toHaveLength(1);
  });
});
