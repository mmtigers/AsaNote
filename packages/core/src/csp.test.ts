import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "./csp";

const directive = (policy: string, name: string) =>
  policy
    .split("; ")
    .find((d) => d.startsWith(`${name} `))
    ?.slice(name.length + 1)
    .split(" ");

describe("buildContentSecurityPolicy", () => {
  const policy = buildContentSecurityPolicy({ supabaseUrl: "https://abc.supabase.co/rest/v1/" });

  it("Supabase の接続先と画像の読み込み先を、パスを落とした origin で許可する", () => {
    expect(directive(policy, "connect-src")).toEqual(["'self'", "https://abc.supabase.co"]);
    expect(directive(policy, "img-src")).toContain("https://abc.supabase.co");
  });

  it("接続先は自分と Supabase だけ(他のサイトへ情報を送れない)", () => {
    expect(directive(policy, "connect-src")).not.toContain("*");
    expect(directive(policy, "default-src")).toEqual(["'self'"]);
  });

  it("フレーム埋め込み・<object>・<base> の差し替え・外部へのフォーム送信を禁止する", () => {
    expect(directive(policy, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(policy, "object-src")).toEqual(["'none'"]);
    expect(directive(policy, "base-uri")).toEqual(["'self'"]);
    expect(directive(policy, "form-action")).toEqual(["'self'"]);
  });

  it("スクリプトは自分のオリジンとインラインだけ。本番では unsafe-eval を許可しない", () => {
    expect(directive(policy, "script-src")).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("開発時だけ unsafe-eval を許可する", () => {
    const dev = buildContentSecurityPolicy({ isDev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
  });

  it("Supabase の URL が未設定・不正でも、他の指定は崩れない", () => {
    for (const supabaseUrl of [undefined, "", "not a url"]) {
      const p = buildContentSecurityPolicy({ supabaseUrl });
      expect(directive(p, "connect-src")).toEqual(["'self'"]);
      expect(directive(p, "img-src")).toEqual(["'self'", "blob:", "data:"]);
    }
  });

  it("Google Fonts(CSS と実体)を許可する", () => {
    expect(directive(policy, "style-src")).toContain("https://fonts.googleapis.com");
    expect(directive(policy, "font-src")).toContain("https://fonts.gstatic.com");
  });
});
