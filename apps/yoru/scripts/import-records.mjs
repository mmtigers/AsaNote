#!/usr/bin/env node
// 過去のメモをテストデータとして evening_records へ取り込むための、ローカル専用の一括インポートスクリプト
// (docs/SPEC.md Q6)。あさノートの scripts/import-records.mjs と同じ方式。
//
// 通常のアプリは RLS(auth.uid() = user_id)により本人のセッションでしか書き込めないが、このスクリプトは
// service role key(RLS を迂回できる管理者キー)で、指定したメールアドレスのユーザーとして登録する。
// service role key はダッシュボードの「Project Settings > API」から取得できるが、絶対にクライアント側の
// コードやリポジトリに含めず、実行時の環境変数としてのみ渡すこと。
//
// ★ 個人情報の扱い: 取り込むデータ本体(records.json)はリポジトリにコミットしない。
//   scripts/data/ または *.local.json に置く(どちらも .gitignore 済み)。
//
// 使い方:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=xxxx \
//   node scripts/import-records.mjs <records.json> <登録先メールアドレス> [子どもID] [--dry-run]
//
//   --dry-run: 検証と件数の表示だけを行い、DB へは書き込まない(service role key も不要)。
//
// <records.json> の形は scripts/import-records.example.json を参照(架空のデータ)。
// recordDate 以外は省略可。times のキーは arrive / hwStart / hwEnd / dinner / bath / prep / bed。
//
// 同じユーザー・同じ日付(・子どもID)の記録が既にあれば上書き更新し、無ければ新規作成する
// (何度実行しても結果が変わらない = べき等)。複数の子どもがいる家庭でのみ第3引数(子どもID)を指定する
// (未指定時は子ども未分類の記録を対象にする)。

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

// src/lib/db/sync.ts の TIME_COLUMNS と同じ対応。
export const TIME_COLUMNS = {
  arrive: "t_arrive",
  hwStart: "t_hw_start",
  hwEnd: "t_hw_end",
  dinner: "t_dinner",
  bath: "t_bath",
  prep: "t_prep",
  bed: "t_bed",
};

const OUTCOMES = ["calm", "rough", "storm"];
const DINNERS = ["ate", "little", "no"];
const EFFECTS = ["good", "mid", "bad"];
const MEMO_MAX_LENGTH = 2000; // schema.sql の CHECK 制約と同じ値
const TAG_FIELDS = {
  dinnerWhy: "dinner_why",
  free: "free_tags",
  friend: "friend_tags",
  trigger: "trigger_tags",
  behavior: "behavior_tags",
  response: "response_tags",
  body: "body_tags",
};

function oneOf(value, allowed, name) {
  if (value == null) return null;
  if (!allowed.includes(value)) throw new Error(`${name} は ${allowed.join(" / ")} のいずれかです: ${value}`);
  return value;
}

function timeValue(value, name) {
  if (value == null) return null;
  if (typeof value !== "string" || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error(`${name} は "HH:MM" の形式です: ${value}`);
  }
  return value;
}

// 1件分の検証と DB 行への変換(DB には触れない)。不正な値は黙って捨てず例外にする。
export function buildRecordRow(record, userId, childId, now) {
  if (!record.recordDate || !/^\d{4}-\d{2}-\d{2}$/.test(record.recordDate)) {
    throw new Error(`recordDate は "YYYY-MM-DD" 形式で必須です: ${record.recordDate}`);
  }
  const times = record.times ?? {};
  for (const key of Object.keys(times)) {
    if (!(key in TIME_COLUMNS)) throw new Error(`times の未知のキーです: ${key}`);
  }
  const memo = record.memo ?? null;
  if (memo !== null && memo.length > MEMO_MAX_LENGTH) throw new Error(`memo は${MEMO_MAX_LENGTH}文字以内です`);

  const tags = {};
  for (const [field, column] of Object.entries(TAG_FIELDS)) {
    const value = record[field] ?? [];
    if (!Array.isArray(value) || value.some((t) => typeof t !== "string")) {
      throw new Error(`${field} は文字列の配列です`);
    }
    tags[column] = value;
  }

  return {
    user_id: userId,
    child_id: childId,
    record_date: record.recordDate,
    outcome: oneOf(record.outcome, OUTCOMES, "outcome"),
    dinner: oneOf(record.dinner, DINNERS, "dinner"),
    response_effect: oneOf(record.responseEffect, EFFECTS, "responseEffect"),
    ...Object.fromEntries(
      Object.entries(TIME_COLUMNS).map(([key, column]) => [column, timeValue(times[key], `times.${key}`)])
    ),
    ...tags,
    memo,
    updated_at: now,
  };
}

export async function upsertRecord(supabase, userId, childId, record, now = new Date().toISOString()) {
  const row = buildRecordRow(record, userId, childId, now);

  let query = supabase.from("evening_records").select("id").eq("user_id", userId).eq("record_date", row.record_date);
  query = childId ? query.eq("child_id", childId) : query.is("child_id", null);

  const { data: existing, error: findError } = await query
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const { error } = await supabase.from("evening_records").update(row).eq("id", existing.id);
    if (error) throw error;
    return "updated";
  }

  const { error } = await supabase
    .from("evening_records")
    .insert({ id: crypto.randomUUID(), created_at: now, ...row });
  if (error) throw error;
  return "inserted";
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const [recordsPath, userEmail, childId = null] = args.filter((a) => a !== "--dry-run");
  if (!recordsPath || !userEmail) {
    console.error("使い方: node scripts/import-records.mjs <records.json> <登録先メールアドレス> [子どもID] [--dry-run]");
    process.exit(1);
  }

  const records = JSON.parse(await readFile(recordsPath, "utf-8"));
  if (!Array.isArray(records)) {
    console.error("records.json は配列である必要があります。");
    process.exit(1);
  }

  if (dryRun) {
    // 全件を検証してから終了する。書き込みはしない。
    records.forEach((record, i) => {
      try {
        buildRecordRow(record, "dry-run", childId, new Date().toISOString());
      } catch (e) {
        throw new Error(`${i + 1}件目(${record?.recordDate}): ${e.message}`);
      }
    });
    console.log(`検証OK: ${records.length}件(--dry-run のため書き込みはしていません)`);
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("環境変数 SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください。");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userList, error: userError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (userError) throw userError;
  const user = userList.users.find((u) => u.email === userEmail);
  if (!user) {
    console.error(`ユーザーが見つかりません: ${userEmail}`);
    process.exit(1);
  }

  const results = { inserted: 0, updated: 0 };
  for (const record of records) {
    const result = await upsertRecord(supabase, user.id, childId, record);
    results[result] += 1;
    console.log(`${record.recordDate}: ${result === "inserted" ? "新規作成" : "更新"}`);
  }
  console.log(`完了: 新規${results.inserted}件 / 更新${results.updated}件`);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
