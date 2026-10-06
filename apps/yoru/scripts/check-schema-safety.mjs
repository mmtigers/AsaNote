#!/usr/bin/env node
// supabase/schema.sql が、よるノート固有の表(evening_*)以外に触れていないかを検査する(docs/SPEC.md §7)。
//
// 共有モードではあさノートと同じDBへ両方のスキーマを自動適用するため、よるノート側の schema.sql が
// 共通表(groups / group_members / group_invites / children)やあさノートの表(records など)へ
// DROP / ALTER / ポリシー追加をすると、あさノートを壊す。人の注意に頼らず CI で止める。
//
// 方針は許可リスト: 対象が evening_ で始まる表・名前に evening を含む関数に限り許可し、それ以外の
// 文(未知の文を含む)はすべて違反として報告する。許可すべき文が増えたらここへ明示的に足すこと。
//
//   node scripts/check-schema-safety.mjs [schema.sql のパス]

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// コメントを除き、$$ ... $$ の中身(関数本体の ; )を潰したうえで、文ごとに分ける。
export function splitStatements(sql) {
  const noComments = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
  const masked = noComments.replace(/\$\$[\s\S]*?\$\$/g, (m) => m.replace(/;/g, "\u0000"));
  return masked
    .split(";")
    .map((s) => s.replace(/\u0000/g, ";").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const NAME = String.raw`(?:public\.)?"?([a-z0-9_.]+)"?`;
const isEvening = (name) => /^(public\.)?evening_/.test(name);
const mentionsEvening = (name) => name.includes("evening");

const RULES = [
  { re: /^create extension\b/i, ok: () => true },
  { re: new RegExp(`^create table (?:if not exists )?${NAME}`, "i"), ok: (m) => isEvening(m[1]) },
  { re: new RegExp(`^alter table (?:if exists )?(?:only )?${NAME}`, "i"), ok: (m) => isEvening(m[1]) },
  { re: new RegExp(`^create (?:unique )?index (?:if not exists )?\\S+ on ${NAME}`, "i"), ok: (m) => isEvening(m[1]) },
  { re: new RegExp(`^create (?:or replace )?function ${NAME}`, "i"), ok: (m) => mentionsEvening(m[1]) },
  { re: new RegExp(`^create (?:or replace )?trigger \\S+ .* on ${NAME}`, "i"), ok: (m) => isEvening(m[1]) },
  { re: new RegExp(`^drop trigger (?:if exists )?\\S+ on ${NAME}`, "i"), ok: (m) => isEvening(m[1]) },
  // ポリシーは evening_ の表、または Storage の写真バケット用(ポリシー名が "evening" で始まるもの)だけ。
  {
    re: /^(?:create|drop) policy (?:if exists )?"([^"]+)" on ([a-z0-9_.]+)/i,
    ok: (m) => isEvening(m[2]) || (m[2] === "storage.objects" && /^evening/i.test(m[1])),
  },
  // 写真用バケットの登録だけ。
  { re: /^insert into storage\.buckets\b/i, ok: (_m, stmt) => /'evening-photos'/.test(stmt) && !/\bdelete\b/i.test(stmt) },
];

// 違反した文のリストを返す(空なら安全)。
export function findUnsafeStatements(sql) {
  const problems = [];
  for (const stmt of splitStatements(sql)) {
    const rule = RULES.find((r) => r.re.test(stmt));
    const match = rule?.re.exec(stmt);
    if (!rule || !match || !rule.ok(match, stmt)) {
      problems.push(stmt.length > 140 ? `${stmt.slice(0, 140)}…` : stmt);
    }
  }
  return problems;
}

async function main() {
  const path = process.argv[2] ?? "supabase/schema.sql";
  const problems = findUnsafeStatements(await readFile(path, "utf-8"));
  if (problems.length === 0) {
    console.log(`${path}: よるノート固有の表(evening_*)以外には触れていません。`);
    return;
  }
  console.error(`${path} に、evening_* 以外へ触れる(または許可リストに無い)文があります:`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error("共通表(あさノートと共有)を壊さないため、変更はあさノート側で行ってください(docs/SPEC.md §7)。");
  process.exit(1);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
