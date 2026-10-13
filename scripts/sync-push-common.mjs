#!/usr/bin/env node
// Edge Function の共通ロジック(pushCommon.ts)を、あさノート(正)からよるノートへ複製する(#202)。
//
// Edge Function はアプリごとに別の場所からデプロイする(あさノートはルートの supabase/functions、
// よるノートは apps/yoru の supabase/functions)ため、ディレクトリをまたぐ import は使えない
// (プロジェクトの外のファイルをデプロイで取り込めるかは、実際にデプロイしないと分からない。失敗すると
// 通知が止まる)。そこでコピーで持ち、ずれたら CI(pushCommonSync.test.ts)が失敗する。
//
//   node scripts/sync-push-common.mjs           正からコピーを作り直す(直したあとに実行する)
//   node scripts/sync-push-common.mjs --check   ずれていないかを確かめる(ずれていたら終了コード1)
//
// コピーは正と**バイト単位で同一**にする(ヘッダーのコメントは、正の側に「コピーは直接編集しない」と書いてある)。

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** 正(あさノート)。リポジトリのルートからの相対パス。 */
export const SOURCE = "supabase/functions/_shared/pushCommon.ts";
/** よるノート側のコピー。 */
export const COPY = "apps/yoru/supabase/functions/_shared/pushCommon.ts";

async function readOrNull(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * コピーが正と同一かを返す。コピーが無いときも、同一ではない。
 * @param {string} root リポジトリのルート
 * @returns {Promise<{ inSync: boolean, reason: string | null }>}
 */
export async function checkPushCommon(root) {
  const source = await readFile(join(root, SOURCE));
  const copy = await readOrNull(join(root, COPY));
  if (copy === null) return { inSync: false, reason: `${COPY} がありません` };
  if (!source.equals(copy)) return { inSync: false, reason: `${COPY} が ${SOURCE} と違います` };
  return { inSync: true, reason: null };
}

/** 正からコピーを作り直す。 */
export async function syncPushCommon(root) {
  const source = await readFile(join(root, SOURCE));
  await writeFile(join(root, COPY), source);
}

async function main(argv) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  if (argv.includes("--check")) {
    const { inSync, reason } = await checkPushCommon(root);
    if (inSync) {
      console.log(`${COPY} は ${SOURCE} と同一です。`);
      return 0;
    }
    console.error(
      `::error::${reason}。${SOURCE} を直したら、'node scripts/sync-push-common.mjs' でコピーを作り直してください(コピーは直接編集しない)。`
    );
    return 1;
  }
  await syncPushCommon(root);
  console.log(`${SOURCE} → ${COPY} を複製しました。`);
  return 0;
}

// テストから import されたときは実行しない。
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(await main(process.argv.slice(2)));
}
