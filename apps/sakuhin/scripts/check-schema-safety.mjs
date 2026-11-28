#!/usr/bin/env node
// supabase/schema.sql が、さくひんノート固有のもの(sakuhin_*)以外に触れていないかを検査する(docs/SPEC.md §9)。
// よるノートの scripts/check-schema-safety.mjs と同じ方式。
//
// 共有モードではあさノート・よるノートと同じ本番DBへ自動適用するため、さくひんノートの schema.sql が
// 共通表(groups / group_members / group_invites / children)やあさノート・よるノートの表へ
// DROP / ALTER / ポリシー追加をすると、ほかのアプリを壊す。人の注意に頼らず CI(単体テスト)と、DB へ流す前に止める。
//
// 方針は許可リスト: 対象が sakuhin_ で始まる表・名前に sakuhin を含む関数に限り許可し、それ以外の
// 文(未知の文を含む)はすべて違反として報告する。許可すべき文が増えたらここへ明示的に足すこと。
// 唯一の例外は、作品がある子どもの削除を止めるトリガー(children の上の sakuhin_keep_child_with_works。§11 D11)。
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
const isSakuhin = (name) => /^(public\.)?sakuhin_/.test(name);
const mentionsSakuhin = (name) => name.includes("sakuhin");
// children の上に置いてよいトリガーは、これ1つだけ。
const CHILD_GUARD_TRIGGER = "sakuhin_keep_child_with_works";
const ROLES = String.raw`(?:anon|authenticated|public)(?:\s*,\s*(?:anon|authenticated|public))*`;

const RULES = [
  { re: new RegExp(`^create table (?:if not exists )?${NAME}`, "i"), ok: (m) => isSakuhin(m[1]) },
  { re: new RegExp(`^alter table (?:if exists )?(?:only )?${NAME}`, "i"), ok: (m) => isSakuhin(m[1]) },
  { re: new RegExp(`^create (?:unique )?index (?:if not exists )?\\S+ on ${NAME}`, "i"), ok: (m) => isSakuhin(m[1]) },
  { re: new RegExp(`^create (?:or replace )?function ${NAME}`, "i"), ok: (m) => mentionsSakuhin(m[1]) },
  {
    re: new RegExp(`^create (?:or replace )?trigger (\\S+) .* on ${NAME}`, "i"),
    ok: (m) => isSakuhin(m[2]) || (m[1] === CHILD_GUARD_TRIGGER && /^(public\.)?children$/.test(m[2])),
  },
  {
    re: new RegExp(`^drop trigger (?:if exists )?(\\S+) on ${NAME}`, "i"),
    ok: (m) => isSakuhin(m[2]) || (m[1] === CHILD_GUARD_TRIGGER && /^(public\.)?children$/.test(m[2])),
  },
  // ポリシーは sakuhin_ の表、または Storage の写真バケット用(ポリシー名が "sakuhin" で始まるもの)だけ。
  {
    re: /^(?:create|drop) policy (?:if exists )?"([^"]+)" on ([a-z0-9_.]+)/i,
    ok: (m) => isSakuhin(m[2]) || (m[2] === "storage.objects" && /^sakuhin/i.test(m[1])),
  },
  // 写真用バケットの登録だけ。
  { re: /^insert into storage\.buckets\b/i, ok: (_m, stmt) => /'sakuhin-works'/.test(stmt) && !/\bdelete\b/i.test(stmt) },
  // 自分の表の列の権限(更新できる列を絞る)と、自分の関数の実行権限だけ。
  { re: new RegExp(`^revoke (?:update|all) on (?:table )?${NAME} from ${ROLES}$`, "i"), ok: (m) => isSakuhin(m[1]) },
  { re: new RegExp(`^grant update \\([a-z0-9_, ]+\\) on (?:table )?${NAME} to authenticated$`, "i"), ok: (m) => isSakuhin(m[1]) },
  { re: new RegExp(`^revoke all on function ${NAME}\\([^)]*\\) from ${ROLES}$`, "i"), ok: (m) => mentionsSakuhin(m[1]) },
  { re: new RegExp(`^grant execute on function ${NAME}\\([^)]*\\) to authenticated$`, "i"), ok: (m) => mentionsSakuhin(m[1]) },
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
    console.log(`${path}: さくひんノート固有のもの(sakuhin_*)以外には触れていません。`);
    return;
  }
  console.error(`${path} に、sakuhin_* 以外へ触れる(または許可リストに無い)文があります:`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error("共通表(あさノート・よるノートと共有)を壊さないため、共通表の変更はルートの supabase/schema.sql で行ってください(docs/SPEC.md §9)。");
  process.exit(1);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
