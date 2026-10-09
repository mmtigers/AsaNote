import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadE2EConfig, type E2EConfigResult } from "./config";

/** ローカルの(カレントディレクトリ=apps/asa の).env.local に書かれた NEXT_PUBLIC_SUPABASE_URL(=普段使いの接続先。本番のことが多い)。 */
function localEnvSupabaseUrls(): string[] {
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => /^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?([^"'\s#]+)/.exec(line)?.[1])
    .filter((v): v is string => !!v);
}

/**
 * プロセスの環境変数から設定を読む。.env.local の接続先(普段使い=本番の可能性が高い)も禁止URLに含める。
 * playwright.supabase.config.ts と spec の両方がこれを使う(どちらから入っても同じガードがかかる)。
 */
export function loadE2EConfigFromProcess(): E2EConfigResult {
  return loadE2EConfig(process.env, localEnvSupabaseUrls());
}
