// ユーザー向けの変更なのに更新履歴(src/data/releases.ts)が更新されない、
// あるいは version がずれる、のを防ぐためのCIチェック(警告ではなく失敗させる)。
//
// 例外(更新履歴に載せない変更。依存更新・内部リファクタ・docsのみ等):
//   - PRに `no-release-note` ラベルを付ける
//   - PRのタイトル/本文、またはコミットメッセージに `[skip release-note]` を含める
// 例外にしても、versionの一致(releases.ts / package.json / package-lock.json)は常に確認する。
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SKIP_LABEL = "no-release-note";
export const SKIP_MARKER = "[skip release-note]";
const RELEASES_PATH = "src/data/releases.ts";

// ユーザーに見える挙動・文言・選択肢に影響しうるディレクトリ。
// 共通パッケージ(packages/core/src/)は両アプリの画面に影響するため、リポジトリルートからの相対パスで監視する(#200)。
// どちらのアプリのチェックでも、core の変更は「そのアプリのユーザー向けの変更」として扱う
// (=core を変えたら、あさノート・よるノートの両方で更新履歴と版上げが要る。載せない変更は例外指定を使う)。
export const CORE_PREFIX = "packages/core/src/";
const WATCHED_PREFIXES = ["src/app/", "src/components/", "src/lib/", "src/constants/", "public/", CORE_PREFIX];

export function isUserFacingChange(file) {
  if (!WATCHED_PREFIXES.some((p) => file.startsWith(p))) return false;
  if (/\.test\.tsx?$/.test(file)) return false;
  if (file === "src/lib/db/database.types.ts") return false;
  return true;
}

// 先頭(releases[0])のversion。releases.tsは新しい順に並べる決まり。
export function topReleaseVersion(source) {
  const m = source.match(/version:\s*"(\d+\.\d+\.\d+)"/);
  return m ? m[1] : null;
}

export function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/**
 * @param {object} input
 * @param {string[]} input.changedFiles BASE..HEADで変わったファイル
 * @param {string[]} input.labels PRのラベル名
 * @param {string} input.skipText PRタイトル・本文・コミットメッセージを連結したもの
 * @param {string} input.releasesSource HEADのreleases.ts
 * @param {string | null} input.baseReleasesSource BASEのreleases.ts(無ければnull)
 * @param {string} input.packageVersion package.jsonのversion
 * @param {string} input.lockVersion package-lock.jsonのトップレベルversion
 * @returns {{ ok: boolean, errors: string[], notes: string[] }}
 */
export function checkReleaseNotes(input) {
  const errors = [];
  const notes = [];

  // 1. versionの一致は、例外指定に関係なく常に確認する。
  const top = topReleaseVersion(input.releasesSource);
  if (!top) {
    errors.push(`${RELEASES_PATH} から先頭のversionを読み取れませんでした。`);
  } else {
    if (top !== input.packageVersion) {
      errors.push(`${RELEASES_PATH} の先頭version(${top})と package.json のversion(${input.packageVersion})が一致しません。`);
    }
    if (input.lockVersion !== input.packageVersion) {
      errors.push(`package-lock.json のversion(${input.lockVersion})と package.json のversion(${input.packageVersion})が一致しません。`);
    }
  }

  // 2. ユーザー向けの変更があるときは、更新履歴の追加を必須にする。
  const userFacing = input.changedFiles.filter(isUserFacingChange);
  if (userFacing.length === 0) {
    notes.push("ユーザー向けの変更が無いため、更新履歴の追加チェックはスキップしました。");
    return { ok: errors.length === 0, errors, notes };
  }

  const skipped = input.labels.includes(SKIP_LABEL) || input.skipText.toLowerCase().includes(SKIP_MARKER);
  if (skipped) {
    notes.push(`例外指定(ラベル ${SKIP_LABEL} または ${SKIP_MARKER})のため、更新履歴の追加チェックはスキップしました。`);
    return { ok: errors.length === 0, errors, notes };
  }

  if (!input.changedFiles.includes(RELEASES_PATH)) {
    errors.push(
      `ユーザー向けの変更があるのに ${RELEASES_PATH} が更新されていません(対象: ${userFacing.slice(0, 5).join(", ")}${userFacing.length > 5 ? " ほか" : ""})。` +
        `更新履歴を追加してversionを上げてください。更新履歴に載せない変更なら、PRに ${SKIP_LABEL} ラベルを付けるか、PR本文かコミットメッセージに ${SKIP_MARKER} と書いてください。`
    );
  } else if (top && input.baseReleasesSource) {
    const baseTop = topReleaseVersion(input.baseReleasesSource);
    if (baseTop && compareVersions(top, baseTop) <= 0) {
      errors.push(`${RELEASES_PATH} の先頭version(${top})が変更前(${baseTop})より新しくありません。新しいversionを先頭に追加してください。`);
    }
  }

  if (errors.length === 0) notes.push("更新履歴とversionの更新を確認しました。");
  return { ok: errors.length === 0, errors, notes };
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

// モノレポでは package-lock.json がリポジトリルートに1つだけあり、このアプリの version は
// `packages["apps/<app>"]` に入る。ルート直下の version(= ルートの package.json)ではない。
function readLockVersion() {
  const topLevel = git("rev-parse", "--show-toplevel").trim();
  const prefix = git("rev-parse", "--show-prefix").trim().replace(/\/$/, "");
  const lock = JSON.parse(readFileSync(`${topLevel}/package-lock.json`, "utf8"));
  return lock.packages?.[prefix]?.version ?? lock.version;
}

function main() {
  const base = process.env.BASE ?? "";
  if (!base || /^0+$/.test(base)) {
    console.log("比較対象のベースコミットが無いため、このチェックをスキップします。");
    return 0;
  }

  const labels = JSON.parse(process.env.PR_LABELS || "[]");
  const skipText = [process.env.PR_TITLE, process.env.PR_BODY, git("log", "--format=%B", `${base}..HEAD`)].join("\n");
  let baseReleasesSource = null;
  try {
    // `./` は現在のディレクトリ(アプリのルート)からの相対パスを意味する。
    baseReleasesSource = git("show", `${base}:./${RELEASES_PATH}`);
  } catch {
    // BASEにreleases.tsが無い場合は、versionの増加チェックだけ行わない。
  }

  const result = checkReleaseNotes({
    // --relative: アプリのルートからの相対パスで返す(他のアプリの変更は含めない)。
    // core の変更はアプリ配下ではないため、ルート基準(:/)で別に取って足す(--relative はアプリ外を返さない)。
    changedFiles: [
      ...git("diff", "--name-only", "--relative", base, "HEAD").split("\n"),
      ...git("diff", "--name-only", base, "HEAD", "--", `:/${CORE_PREFIX}`).split("\n"),
    ].filter(Boolean),
    labels,
    skipText,
    releasesSource: readFileSync(RELEASES_PATH, "utf8"),
    baseReleasesSource,
    packageVersion: JSON.parse(readFileSync("package.json", "utf8")).version,
    lockVersion: readLockVersion(),
  });

  for (const n of result.notes) console.log(n);
  for (const e of result.errors) console.log(`::error::${e}`);
  return result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
