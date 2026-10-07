#!/usr/bin/env node
// CI 用のスタブ(supabase/ci/shared-tables-stub.sql)が、共通表の「正」(あさノートの
// ルート supabase/schema.sql)とずれていないかを検査する(#156)。
//
// スタブは、素の Postgres で よるノートの schema.sql を適用し、型を生成するためだけの最小定義。
// あさノート側が共通表(groups / group_members / children)の列を変えたのにスタブが追随しないと、
// よるノートの CI は緑のまま、生成される型だけが実際の DB とずれる。それを CI で止める。
//
// 比べるのは、各表の「列名・型・not null・unique・references・check」。次は比べない(意図的な差):
//   - default の式: あさノートは uuid_generate_v4()、スタブは gen_random_uuid()(拡張に依存しないため)
//   - インデックス・RLS・ポリシー・トリガー(型生成に関係しない)
//
//   node scripts/check-shared-stub.mjs [あさノートの schema.sql] [スタブ]

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const SHARED_TABLES = ["groups", "group_members", "children"];

// コメントを除く。
function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

// `create table if not exists <name> ( ... );` の本体(最外のかっこの中)を取り出す。
function tableBody(sql, name) {
  const re = new RegExp(String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?${name}\s*\(`, "i");
  const m = re.exec(sql);
  if (!m) return null;
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  for (; i < sql.length && depth > 0; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") depth--;
  }
  return depth === 0 ? sql.slice(start, i - 1) : null;
}

// かっこの外にあるカンマで分ける(`char_length(name) between 1 and 50` や `primary key (a, b)` を壊さない)。
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
}

// 表の定義を `{ 列名: 正規化した定義 }` にする。default は除き、表レベルの primary key は列へ反映する。
export function parseTable(sql, name) {
  const body = tableBody(stripComments(sql), name);
  if (body === null) return null;
  const columns = {};
  const primaryKey = [];
  for (const part of splitTopLevel(body)) {
    const pk = /^primary key \(([^)]*)\)$/i.exec(part);
    if (pk) {
      primaryKey.push(...(pk[1] ?? "").split(",").map((c) => c.trim().toLowerCase()));
      continue;
    }
    const m = /^"?([a-z0-9_]+)"?\s+(.*)$/i.exec(part);
    if (!m) {
      columns[`(表レベル) ${part.toLowerCase()}`] = "";
      continue;
    }
    // default の式は比べない。式は空白を含まない(`now()`・`gen_random_uuid()`)ものに限られる。
    const def = (m[2] ?? "").replace(/\bdefault\s+\S+/gi, "").replace(/\s+/g, " ").trim().toLowerCase();
    columns[(m[1] ?? "").toLowerCase()] = def;
  }
  for (const col of primaryKey) {
    const def = columns[col];
    if (def !== undefined && !/\bnot null\b/.test(def)) columns[col] = `${def} not null`.trim();
  }
  return columns;
}

// 比べて、ずれを文章のリストで返す(空なら一致)。
export function compareTables(sourceSql, stubSql, tables = SHARED_TABLES) {
  const problems = [];
  for (const name of tables) {
    const source = parseTable(sourceSql, name);
    const stub = parseTable(stubSql, name);
    if (!source) {
      problems.push(`${name}: あさノートの schema.sql に定義が見つかりません(表名が変わった?)`);
      continue;
    }
    if (!stub) {
      problems.push(`${name}: スタブに定義がありません`);
      continue;
    }
    for (const col of Object.keys(source)) {
      if (!(col in stub)) problems.push(`${name}.${col}: スタブに無い列です(あさノート: ${source[col]})`);
      else if (source[col] !== stub[col]) {
        problems.push(`${name}.${col}: 定義が違います(あさノート: ${source[col]} / スタブ: ${stub[col]})`);
      }
    }
    for (const col of Object.keys(stub)) {
      if (!(col in source)) problems.push(`${name}.${col}: あさノート側に無い列です(スタブ: ${stub[col]})`);
    }
  }
  return problems;
}

async function main() {
  const sourcePath = process.argv[2] ?? "../../supabase/schema.sql";
  const stubPath = process.argv[3] ?? "supabase/ci/shared-tables-stub.sql";
  const problems = compareTables(await readFile(sourcePath, "utf-8"), await readFile(stubPath, "utf-8"));
  if (problems.length === 0) {
    console.log(`${stubPath}: 共通表(${SHARED_TABLES.join(" / ")})の列が、${sourcePath} と一致しています。`);
    return;
  }
  console.error(`${stubPath} が、共通表の正(${sourcePath})とずれています:`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error("スタブを、あさノート側の定義に合わせて直してください(型生成が実際のDBとずれるのを防ぐため)。");
  process.exit(1);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
