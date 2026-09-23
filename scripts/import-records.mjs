#!/usr/bin/env node
// 過去の記録をまとめてSupabaseのrecordsテーブルへ登録するための一括インポートスクリプト。
//
// 通常のアプリはRLS(auth.uid() = user_id)により本人のセッションでしか書き込めないが、
// このスクリプトはservice role key(RLSを迂回できる管理者キー)を使い、指定したメール
// アドレスのユーザーとして記録を登録する。service role keyはSupabaseダッシュボードの
// 「Project Settings > API」から取得できるが、絶対にクライアント側コードやリポジトリに
// 含めず、実行時の環境変数としてのみ渡すこと。
//
// 使い方:
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=xxxx \
//   node scripts/import-records.mjs <records.json> <登録先メールアドレス> [子どもID]
//
// <records.json> は以下の形の配列(recordDate以外は省略可・null可):
// [
//   {
//     "recordDate": "2026-09-01",      // "YYYY-MM-DD" (必須)
//     "outcome": "reluctant",          // "smooth" | "reluctant" | "absent" | null
//     "wakeTime": "07:15",             // "HH:MM" | null
//     "departTime": "08:20",           // "HH:MM" | null
//     "memo": "自由記述(最大2000字)"
//   },
//   ...
// ]
//
// 同じユーザー・同じ日付(・子どもID)の記録が既にあれば上書き更新し、無ければ新規作成する
// (何度実行しても結果が変わらない = べき等)。複数子ども対応の家庭でのみ第3引数(子どもID)
// を指定する(未指定時は子ども未分類の記録を対象にする)。

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

export function buildRecordRow(record, userId, childId, now) {
  if (!record.recordDate) {
    throw new Error("recordDate は必須です");
  }
  return {
    user_id: userId,
    child_id: childId,
    record_date: record.recordDate,
    outcome: record.outcome ?? null,
    wake_time: record.wakeTime ?? null,
    depart_time: record.departTime ?? null,
    memo: record.memo ?? null,
    updated_at: now,
  };
}

export async function upsertRecord(supabase, userId, childId, record, now = new Date().toISOString()) {
  const row = buildRecordRow(record, userId, childId, now);

  let query = supabase
    .from("records")
    .select("id")
    .eq("user_id", userId)
    .eq("record_date", row.record_date);
  query = childId ? query.eq("child_id", childId) : query.is("child_id", null);

  const { data: existing, error: findError } = await query
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const { error } = await supabase.from("records").update(row).eq("id", existing.id);
    if (error) throw error;
    return "updated";
  }

  const { error } = await supabase
    .from("records")
    .insert({ id: crypto.randomUUID(), created_at: now, ...row });
  if (error) throw error;
  return "inserted";
}

async function main() {
  const [, , recordsPath, userEmail, childId = null] = process.argv;
  if (!recordsPath || !userEmail) {
    console.error("使い方: node scripts/import-records.mjs <records.json> <登録先メールアドレス> [子どもID]");
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("環境変数 SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください。");
    process.exit(1);
  }

  const records = JSON.parse(await readFile(recordsPath, "utf-8"));
  if (!Array.isArray(records)) {
    console.error("records.json は配列である必要があります。");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userList, error: userError } = await supabase.auth.admin.listUsers();
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
