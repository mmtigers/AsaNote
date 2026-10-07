import { describe, expect, it } from "vitest";
import {
  checkReleaseNotes,
  compareVersions,
  isUserFacingChange,
  topReleaseVersion,
} from "../../../../scripts/check-release-notes.mjs";

const releases = (v: string) => `export const releases = [\n  {\n    version: "${v}",\n  },\n];`;

const base = {
  changedFiles: ["src/app/page.tsx", "src/data/releases.ts", "package.json"],
  labels: [] as string[],
  skipText: "",
  releasesSource: releases("0.3.0"),
  baseReleasesSource: releases("0.2.1") as string | null,
  packageVersion: "0.3.0",
  lockVersion: "0.3.0",
};

describe("isUserFacingChange", () => {
  it("アプリコード・定数・publicは対象、テスト・生成型・docsは対象外", () => {
    expect(isUserFacingChange("src/app/page.tsx")).toBe(true);
    expect(isUserFacingChange("src/constants/choices.ts")).toBe(true);
    expect(isUserFacingChange("public/sw.js")).toBe(true);
    expect(isUserFacingChange("src/lib/foo.test.ts")).toBe(false);
    expect(isUserFacingChange("src/lib/db/database.types.ts")).toBe(false);
    expect(isUserFacingChange("docs/SPEC.md")).toBe(false);
    expect(isUserFacingChange("src/data/releases.ts")).toBe(false);
  });
});

describe("version helpers", () => {
  it("先頭のversionを読む", () => {
    expect(topReleaseVersion(releases("1.2.3"))).toBe("1.2.3");
    expect(topReleaseVersion("nothing")).toBeNull();
  });
  it("数値として比較する(0.10.0は0.9.0より新しい)", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("0.3.0", "0.3.0")).toBe(0);
  });
});

describe("checkReleaseNotes", () => {
  it("更新履歴とversionが揃っていれば通る", () => {
    expect(checkReleaseNotes(base).ok).toBe(true);
  });

  it("ユーザー向けの変更があるのに releases.ts が未更新なら失敗", () => {
    const r = checkReleaseNotes({ ...base, changedFiles: ["src/app/page.tsx", "package.json"] });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("更新されていません");
  });

  it("package.json だけ更新しても失敗(更新履歴が必須)", () => {
    const r = checkReleaseNotes({ ...base, changedFiles: ["src/lib/x.ts", "package.json"] });
    expect(r.ok).toBe(false);
  });

  it("src/constants の変更も対象", () => {
    const r = checkReleaseNotes({ ...base, changedFiles: ["src/constants/choices.ts"] });
    expect(r.ok).toBe(false);
  });

  it("releases.ts を触ってもversionが上がっていなければ失敗", () => {
    const r = checkReleaseNotes({ ...base, baseReleasesSource: releases("0.3.0") });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain("より新しくありません");
  });

  it("releases.ts と package.json のversionがずれていれば失敗", () => {
    expect(checkReleaseNotes({ ...base, packageVersion: "0.2.1" }).ok).toBe(false);
  });

  it("package-lock.json のversionがずれていれば失敗", () => {
    expect(checkReleaseNotes({ ...base, lockVersion: "0.2.1" }).ok).toBe(false);
  });

  it("ユーザー向けの変更が無ければ(docs・テストのみ)通る", () => {
    const r = checkReleaseNotes({ ...base, changedFiles: ["docs/SPEC.md", "src/lib/a.test.ts"] });
    expect(r.ok).toBe(true);
  });

  it("no-release-note ラベルで例外にできる", () => {
    const r = checkReleaseNotes({ ...base, changedFiles: ["src/lib/x.ts"], labels: ["no-release-note"] });
    expect(r.ok).toBe(true);
  });

  it("[skip release-note] で例外にできる(大文字小文字は問わない)", () => {
    const r = checkReleaseNotes({ ...base, changedFiles: ["src/lib/x.ts"], skipText: "fix [Skip Release-Note]" });
    expect(r.ok).toBe(true);
  });

  it("例外指定でもversionの不一致は失敗にする", () => {
    const r = checkReleaseNotes({
      ...base,
      changedFiles: ["src/lib/x.ts"],
      labels: ["no-release-note"],
      packageVersion: "0.2.1",
    });
    expect(r.ok).toBe(false);
  });
});
