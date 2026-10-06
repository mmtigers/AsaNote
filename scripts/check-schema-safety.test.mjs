import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findUnsafeStatements, splitStatements } from "./check-schema-safety.mjs";

describe("実際の supabase/schema.sql", () => {
  it("evening_* 以外に触れていない", () => {
    const sql = readFileSync(path.resolve(process.cwd(), "supabase/schema.sql"), "utf-8");
    expect(findUnsafeStatements(sql)).toEqual([]);
  });
});

describe("splitStatements", () => {
  it("コメントを無視し、関数本体の ; では分けない", () => {
    const stmts = splitStatements(`
      -- drop table groups;
      create or replace function enforce_evening_x() returns trigger as $$
      begin raise exception 'x'; return new; end; $$ language plpgsql;
      /* drop table children; */
      create table if not exists evening_a (id int);`);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain("raise exception 'x'; return new;");
  });
});

describe("findUnsafeStatements", () => {
  it.each([
    ["共通表の削除", "drop table groups;"],
    ["共通表の削除(cascade)", "drop table if exists public.children cascade;"],
    ["共通表の変更", "alter table children add column x int;"],
    ["共通表のポリシーの削除", 'drop policy if exists "children are readable" on children;'],
    ["共通表のポリシーの追加", 'create policy "x" on group_members for select using (true);'],
    ["あさノートの表の変更", "alter table records disable row level security;"],
    ["共通表のインデックス", "create index if not exists idx_x on children(name);"],
    ["共通表のトリガー", "drop trigger if exists t on group_members;"],
    ["evening でない関数", "create or replace function create_group() returns void as $$ select 1; $$ language sql;"],
    ["データの削除", "delete from evening_records;"],
    ["truncate", "truncate evening_records;"],
    ["権限の付与", "grant all on groups to authenticated;"],
    ["他のバケット", "insert into storage.buckets (id, name) values ('avatars', 'avatars');"],
    ["他のポリシー名の Storage ポリシー", 'create policy "avatars are public" on storage.objects for select using (true);'],
  ])("違反として検出する: %s", (_name, sql) => {
    expect(findUnsafeStatements(sql)).toHaveLength(1);
  });

  it.each([
    ["表の作成", "create table if not exists evening_x (id uuid primary key references children(id));"],
    ["自分の表のRLS", "alter table evening_x enable row level security;"],
    ["自分の表のポリシー", 'drop policy if exists "evening_x are readable" on public.evening_x;'],
    ["Storage の写真ポリシー", 'create policy "evening photos are deletable" on storage.objects for delete using (true);'],
    ["写真バケット", "insert into storage.buckets (id, name, public) values ('evening-photos', 'evening-photos', false) on conflict do nothing;"],
    ["共通表を参照するポリシー本文", 'create policy "evening_x ok" on evening_x for select using (exists (select 1 from group_members));'],
  ])("許可する: %s", (_name, sql) => {
    expect(findUnsafeStatements(sql)).toEqual([]);
  });
});
