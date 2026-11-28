// 連絡メモの下書きで、AI に渡す内容を作る純粋な関数(仕様 apps/yoru/docs/liaison-memo.md §5)。
// Deno・Supabase に依存しないので、Vitest でテストする(liaisonInput.test.ts)。
//
// id で保存されている選択肢(総合・夕食・対応の効果・節目の時間帯・登校の結果)は、日本語に直してから渡す。
// Edge Function はアプリの src/constants を取り込めない(デプロイで同梱されない)ため、対応表をここに複製し、
// アプリの定義と一致することを liaisonLabelsSync.test.ts で確かめる。タグは日本語のラベルのまま保存されている。

export const ASA_OUTCOME_LABELS: Record<string, string> = {
  smooth: "スムーズに行けた",
  reluctant: "行き渋った",
  absent: "行かなかった",
};

export const YORU_OUTCOME_LABELS: Record<string, string> = {
  calm: "穏やか",
  rough: "少し荒れた",
  storm: "大荒れ",
};

export const DINNER_LABELS: Record<string, string> = { ate: "食べた", little: "少し", no: "食べず" };

export const EFFECT_LABELS: Record<string, string> = { good: "効いた", mid: "少し効いた", bad: "効かなかった" };

// 節目の時間帯(early / mid / late)。DB の列名 → [節目の名前, 帯の表示]。"HH:MM" が入っていればそのまま使う。
export const BAND_LABELS: Record<string, { label: string; bands: Record<string, string> }> = {
  t_arrive: { label: "帰宅", bands: { early: "14時より前", mid: "14〜15時", late: "15時以降" } },
  t_hw_start: { label: "宿題 開始", bands: { early: "15〜17時", mid: "17〜19時", late: "19時以降" } },
  t_bath: { label: "お風呂", bands: { early: "15〜17時", mid: "17〜19時", late: "19時以降" } },
  t_bed: { label: "消灯", bands: { early: "20時より前", mid: "20〜21時", late: "21時以降" } },
};

type Row = Record<string, unknown>;

export interface ChildRow {
  id: string;
  name: string;
}

// その子どもの記録として使うか(仕様 §5.1)。子どもが0〜1人の家庭では記録を常に「未分類」(child_id = null)で
// 保存しているため、子どもが1人だけなら未分類もその子の記録とみなす。2人以上なら、どの子の記録か分からないので使わない。
export function belongsToChild(recordChildId: unknown, childId: string, childCount: number): boolean {
  if (recordChildId === childId) return true;
  return (recordChildId === null || recordChildId === undefined) && childCount === 1;
}

// 子どもの名前を伏せる(仕様 §5.3)。対象の子 → 「本人」、ほかの子 → 「きょうだい」、設定の「伏せたい名前」→ 「〇〇」(#299)。
// - 先頭から1回だけ走査し、その位置で一致する最も長い名前を置き換える(「ともや」と「とも」のように片方がもう片方を
//   含む場合に短いほうで先に壊さないため。置き換えた後の文字列「本人」などを、別の名前でさらに置き換えないため)。
// - ひらがなの名前はカタカナでも、カタカナの名前はひらがなでも置き換える(表記ゆれ)。漢字の読みまでは分からないので、
//   必要なら「伏せたい名前」に登録してもらう。
// - 子どもの名前の直後の敬称(くん・ちゃんなど)は、名前と一緒に置き換える(「本人くん」にしない)。
//   「伏せたい名前」は友だち・先生などにも使うので、敬称は残す(「〇〇先生」)。
// - 2文字以下の短い名前は、ほかの語の一部を置き換えやすい(「とも」→「ともだち」)。直後が文末・記号・敬称・助詞の
//   ときだけ置き換える(「ともが」「とも。」は置き換え、「ともだち」は置き換えない)。
export const MASKED_NAME_PLACEHOLDER = "〇〇";
const CHILD_HONORIFICS = ["ちゃん", "くん", "さん", "君", "様", "さま"];
const SHORT_NAME_MAX = 2;
// 短い名前の直後に来てよい語(助詞など)。長いものから見る必要は無い(前方一致で判定する)。
const FOLLOWERS = [...CHILD_HONORIFICS, "先生", "せんせい", "って", "だけ", "しか", "など", "まで", "から", "より", "たち", "達",
  "は", "が", "を", "に", "の", "と", "も", "へ", "で", "や", "か", "ね", "よ", "な", "ら"];
const WORD_CHAR = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー々]/u;

function shiftKana(name: string, from: number, to: number): string {
  return [...name].map((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return code >= from && code <= to ? String.fromCodePoint(code + (from === 0x3041 ? 0x60 : -0x60)) : ch;
  }).join("");
}

// ひらがな ↔ カタカナの表記ゆれ(ぁ〜ゖ と ァ〜ヶ)。元の名前を含む、重複の無い一覧。
function kanaVariants(name: string): string[] {
  return [...new Set([name, shiftKana(name, 0x3041, 0x3096), shiftKana(name, 0x30a1, 0x30f6)])];
}

interface MaskEntry {
  name: string;
  replacement: string;
  eatHonorific: boolean;
}

function isBoundary(text: string, end: number): boolean {
  const next = text.slice(end);
  if (!next || !WORD_CHAR.test(next[0] ?? "")) return true;
  return FOLLOWERS.some((f) => next.startsWith(f));
}

export function maskNames(text: string, children: ChildRow[], targetId: string, extraNames: string[] = []): string {
  const entries: MaskEntry[] = [];
  for (const child of children) {
    const name = child.name.trim();
    if (!name) continue;
    const replacement = child.id === targetId ? "本人" : "きょうだい";
    for (const v of kanaVariants(name)) entries.push({ name: v, replacement, eatHonorific: true });
  }
  for (const raw of extraNames) {
    const name = raw.trim();
    if (!name) continue;
    for (const v of kanaVariants(name)) entries.push({ name: v, replacement: MASKED_NAME_PLACEHOLDER, eatHonorific: false });
  }
  // 長い名前を先に試す。同じ長さなら子どもの名前(先に足したもの)を優先する。
  entries.sort((a, b) => b.name.length - a.name.length);

  let out = "";
  let i = 0;
  while (i < text.length) {
    let matched = false;
    for (const e of entries) {
      if (!text.startsWith(e.name, i)) continue;
      let end = i + e.name.length;
      const honorific = e.eatHonorific ? CHILD_HONORIFICS.find((h) => text.startsWith(h, end)) : undefined;
      if (e.name.length <= SHORT_NAME_MAX && !honorific && !isBoundary(text, end)) continue;
      if (honorific) end += honorific.length;
      out += e.replacement;
      i = end;
      matched = true;
      break;
    }
    if (!matched) {
      out += text[i];
      i += 1;
    }
  }
  return out;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const tags = (v: unknown): string[] => (Array.isArray(v) ? v.filter((t): t is string => typeof t === "string" && !!t.trim()) : []);
const hhmm = (v: unknown): string | null => (typeof v === "string" && /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : null);

function line(label: string, value: string | null | string[]): string | null {
  if (Array.isArray(value)) return value.length ? `${label}: ${value.join("、")}` : null;
  return value ? `${label}: ${value}` : null;
}

// あさノートの1件を、AI に渡す数行にする。condition_scale(記録した親の体調・旧い列)と struggled(旧い列)は渡さない。
export function describeAsaRecord(r: Row, includeMemo: boolean): string[] {
  const outcome = str(r.outcome);
  return [
    line("登校", outcome ? (ASA_OUTCOME_LABELS[outcome] ?? outcome) : null),
    line("起床", hhmm(r.wake_time)),
    line("起床のようす", tags(r.wake_tags)),
    line("出発", hhmm(r.depart_time)),
    line("付き添い", str(r.companion)),
    line("引き渡し", str(r.handoff) === "なし" ? null : str(r.handoff)),
    line("きっかけ", tags(r.trigger_tags)),
    line("理由", tags(r.reason_tags)),
    line("対応", tags(r.response_tags)),
    includeMemo ? line("メモ", str(r.memo)) : null,
  ].filter((l): l is string => l !== null);
}

// よるノートの1件を、AI に渡す数行にする。
export function describeYoruRecord(r: Row, includeMemo: boolean): string[] {
  const outcome = str(r.outcome);
  const dinner = str(r.dinner);
  const effect = str(r.response_effect);
  const milestones = Object.entries(BAND_LABELS)
    .map(([column, { label, bands }]) => {
      const v = str(r[column]);
      if (!v) return null;
      return `${label} ${bands[v] ?? hhmm(v) ?? v}`;
    })
    .filter((v): v is string => v !== null);
  return [
    line("夜の様子", outcome ? (YORU_OUTCOME_LABELS[outcome] ?? outcome) : null),
    line("節目", milestones),
    line("夕食", dinner ? (DINNER_LABELS[dinner] ?? dinner) : null),
    line("夕食の理由", tags(r.dinner_why)),
    line("自由時間", tags(r.free_tags)),
    line("友だち", tags(r.friend_tags)),
    line("きっかけ", tags(r.trigger_tags)),
    line("行動", tags(r.behavior_tags)),
    line("対応", tags(r.response_tags)),
    line("対応の効果", effect ? (EFFECT_LABELS[effect] ?? effect) : null),
    line("からだ", tags(r.body_tags)),
    includeMemo ? line("メモ", str(r.memo)) : null,
  ].filter((l): l is string => l !== null);
}

export interface MemoSource {
  asaRecords: Row[];
  yoruRecords: Row[];
  rules: { title: string; started_on: string; ended_on: string | null }[];
  concerns: { title: string }[];
  styleExamples: string[];
}

export interface MemoRequestSettings {
  targetChars: number;
  recipientLabel: string;
  includeMemo: boolean;
}

// AI に渡す本文(ユーザーメッセージ)。記録のメモ欄などは <records> の中に「データ」として入れる。
// 名前の伏せ字はここで全体にかける(タグ・メモ・試したこと・検討事項・見本のどこに名前があっても伏せる)。
export function buildUserContent(
  source: MemoSource,
  settings: MemoRequestSettings,
  children: ChildRow[],
  targetId: string,
  instruction: string | null,
  maskedNames: string[] = []
): string {
  const byDate = new Map<string, string[]>();
  const push = (date: string, header: string, lines: string[]) => {
    if (lines.length === 0) return;
    byDate.set(date, [...(byDate.get(date) ?? []), `[${header}]`, ...lines]);
  };
  for (const r of source.asaRecords) push(String(r.record_date), "朝", describeAsaRecord(r, settings.includeMemo));
  for (const r of source.yoruRecords) push(String(r.record_date), "夜", describeYoruRecord(r, settings.includeMemo));
  const days = [...byDate.keys()].sort().map((date) => `## ${date}\n${(byDate.get(date) ?? []).join("\n")}`);

  const rules = source.rules.map((r) => `- ${r.title}(${r.started_on}から${r.ended_on ? `${r.ended_on}まで` : ""})`);
  const concerns = source.concerns.map((c) => `- ${c.title}`);
  const examples = source.styleExamples.map((e, i) => `<example index="${i + 1}">\n${e}\n</example>`);

  const parts = [
    `宛先: ${settings.recipientLabel}`,
    `「おうちでのご様子」の文字数: ${settings.targetChars}字程度`,
    `<records>\n${days.join("\n\n")}\n</records>`,
    rules.length ? `<trying>\n家庭で試していること:\n${rules.join("\n")}\n</trying>` : null,
    concerns.length ? `<concerns>\n気になっていること(未解決):\n${concerns.join("\n")}\n</concerns>` : null,
    examples.length ? `<style_examples>\nこれまでに送った文面(文体の見本):\n${examples.join("\n")}\n</style_examples>` : null,
    instruction ? `<request>\n今回の追加の希望: ${instruction}\n</request>` : null,
  ].filter((p): p is string => p !== null);

  return maskNames(parts.join("\n\n"), children, targetId, maskedNames);
}
