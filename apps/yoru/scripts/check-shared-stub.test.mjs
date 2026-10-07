import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compareTables, parseTable } from "./check-shared-stub.mjs";

const source = readFileSync(path.resolve(process.cwd(), "../../supabase/schema.sql"), "utf-8");
const stub = readFileSync(path.resolve(process.cwd(), "supabase/ci/shared-tables-stub.sql"), "utf-8");

describe("実際のスタブと、あさノートの schema.sql", () => {
  it("共通表の列が一致している", () => {
    expect(compareTables(source, stub)).toEqual([]);
  });
});

describe("parseTable", () => {
  it("default は比べず、表レベルの primary key を not null として扱う", () => {
    const cols = parseTable(
      `create table if not exists t (
        a uuid default uuid_generate_v4(),
        b text, -- コメント
        c int check (c between 1 and 5),
        primary key (a, b)
      );`,
      "t",
    );
    expect(cols).toEqual({ a: "uuid not null", b: "text not null", c: "int check (c between 1 and 5)" });
  });

  it("表が無ければ null", () => {
    expect(parseTable("create table other (id int);", "t")).toBeNull();
  });
});

describe("compareTables(ずれの検出)", () => {
  const base = "create table if not exists t (id uuid primary key default x(), name text not null);";

  it("default の式が違うだけなら一致とみなす", () => {
    const other = "create table if not exists t (id uuid primary key default y(), name text not null);";
    expect(compareTables(base, other, ["t"])).toEqual([]);
  });

  it("あさノートに列が増えたのにスタブに無いと報告する", () => {
    const added = "create table if not exists t (id uuid primary key, name text not null, extra int);";
    const problems = compareTables(added, base, ["t"]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("t.extra");
  });

  it("型・not null の違いを報告する", () => {
    const changed = "create table if not exists t (id uuid primary key, name varchar not null);";
    expect(compareTables(changed, base, ["t"])[0]).toContain("t.name");
    const nullable = "create table if not exists t (id uuid primary key, name text);";
    expect(compareTables(nullable, base, ["t"])[0]).toContain("t.name");
  });

  it("スタブにだけある列・表の欠落を報告する", () => {
    const onlyStub = "create table if not exists t (id uuid primary key, name text not null, ghost int);";
    expect(compareTables(base, onlyStub, ["t"])[0]).toContain("t.ghost");
    expect(compareTables(base, "", ["t"])[0]).toContain("スタブに定義がありません");
    expect(compareTables("", base, ["t"])[0]).toContain("あさノートの schema.sql に定義が見つかりません");
  });
});
