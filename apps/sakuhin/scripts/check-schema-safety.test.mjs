import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findUnsafeStatements, splitStatements } from "./check-schema-safety.mjs";

describe("実際の supabase/schema.sql", () => {
  it("sakuhin_* 以外に触れていない(children の削除を止めるトリガーを除く)", () => {
    const sql = readFileSync(path.resolve(process.cwd(), "supabase/schema.sql"), "utf-8");
    expect(findUnsafeStatements(sql)).toEqual([]);
  });
});

describe("splitStatements", () => {
  it("コメントを無視し、関数本体の ; では分けない", () => {
    const stmts = splitStatements(`
      -- drop table groups;
      create or replace function sakuhin_x() returns trigger as $$
      begin raise exception 'x'; return new; end; $$ language plpgsql;
      /* drop table children; */
      create table if not exists sakuhin_a (id int);`);
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
    ["よるノートの表の変更", "alter table evening_records disable row level security;"],
    ["共通表のインデックス", "create index if not exists idx_x on children(name);"],
    ["共通表の別のトリガー", "drop trigger if exists t on group_members;"],
    ["children の上の、決まった名前以外のトリガー", "create trigger sakuhin_other before delete on children for each row execute function sakuhin_x();"],
    ["決まった名前でも children 以外の共通表のトリガー", "create trigger sakuhin_keep_child_with_works before delete on groups for each row execute function sakuhin_x();"],
    ["sakuhin でない関数", "create or replace function create_group() returns void as $$ select 1; $$ language sql;"],
    ["データの削除", "delete from sakuhin_works;"],
    ["truncate", "truncate sakuhin_works;"],
    ["共通表への権限の付与", "grant all on groups to authenticated;"],
    ["共通表の権限の取り消し", "revoke update on children from authenticated;"],
    ["共通表の列の権限", "grant update (name) on children to authenticated;"],
    ["自分の表でも、全権限の付与", "grant all on sakuhin_works to anon;"],
    ["sakuhin でない関数の実行権限", "grant execute on function create_group() to authenticated;"],
    ["他のバケット", "insert into storage.buckets (id, name) values ('avatars', 'avatars');"],
    ["他のポリシー名の Storage ポリシー", 'create policy "avatars are public" on storage.objects for select using (true);'],
  ])("違反として検出する: %s", (_name, sql) => {
    expect(findUnsafeStatements(sql)).toHaveLength(1);
  });

  it.each([
    ["表の作成", "create table if not exists sakuhin_x (id uuid primary key references children(id));"],
    ["自分の表のRLS", "alter table sakuhin_x enable row level security;"],
    ["自分の表のポリシー", 'drop policy if exists "sakuhin_x are readable" on public.sakuhin_x;'],
    ["Storage の写真ポリシー", 'create policy "sakuhin works photos are deletable" on storage.objects for delete using (true);'],
    ["写真バケット", "insert into storage.buckets (id, name, public) values ('sakuhin-works', 'sakuhin-works', false) on conflict do nothing;"],
    ["共通表を参照するポリシー本文", 'create policy "sakuhin_x ok" on sakuhin_x for select using (exists (select 1 from children));'],
    ["子どもの削除を止めるトリガー", "create trigger sakuhin_keep_child_with_works before delete on children for each row execute function sakuhin_prevent_child_delete_with_works();"],
    ["子どもの削除を止めるトリガーの作り直し", "drop trigger if exists sakuhin_keep_child_with_works on children;"],
    ["自分の表の更新の権限の取り消し", "revoke update on sakuhin_works from anon, authenticated;"],
    ["自分の表の列の権限", "grant update (title, memo) on sakuhin_works to authenticated;"],
    ["自分の関数の権限", "revoke all on function sakuhin_x(text) from public;"],
    ["自分の関数の実行権限", "grant execute on function sakuhin_x(text) to authenticated;"],
  ])("許可する: %s", (_name, sql) => {
    expect(findUnsafeStatements(sql)).toEqual([]);
  });
});
