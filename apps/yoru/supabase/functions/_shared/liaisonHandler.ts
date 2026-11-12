// generate-liaison-memos の本体(仕様 apps/yoru/docs/liaison-memo.md §4〜§9)。Deno・Supabase・AI の SDK に依存せず、
// DB の操作(LiaisonStore)・AI の呼び出し・Push の送信を引数で受け取るので、Vitest で通しで確かめられる(liaisonHandler.test.ts)。
// index.ts は環境変数・認証と、本物の DB・SDK の組み立てだけを行う。
import { type ChildRow, buildUserContent, belongsToChild } from "./liaisonInput.ts";
import { SYSTEM_PROMPT, checkDraft } from "./liaisonPrompt.ts";
import { autoDueDate, jstParts, periodsFor, upcomingDueDate } from "./liaisonSchedule.ts";
import { type PushSubscriptionRow, type SendNotification, sendToSubscriptions } from "./pushLogic.ts";

type Row = Record<string, unknown>;

export const MAX_REGENERATIONS = 3;
export const MAX_AUTO_ATTEMPTS = 3;
// 1回の呼び出しで作る子どもの数の上限(関数の実行時間の上限に収めるため。残りは次の呼び出しで作る)。
export const MAX_CHILDREN_PER_RUN = 5;
// 作成中の印(locked_at)がこれより古ければ、止まったとみなして取り直せる。
export const LOCK_STALE_MS = 10 * 60 * 1000;
export const INSTRUCTION_MAX_CHARS = 100;

export interface LiaisonSettings {
  child_id: string;
  enabled: boolean;
  consented_at: string | null;
  weekday: number;
  hour: number;
  target_chars: number;
  recipient_label: string;
  include_memo: boolean;
  style_examples: string[];
}

export interface MemoRow {
  id: string;
  child_id: string;
  due_date: string;
  status: "generating" | "generated" | "no_records" | "failed";
  attempts: number;
  locked_at: string | null;
  regenerate_count: number;
}

export type MemoPatch = Partial<{
  status: MemoRow["status"];
  attempts: number;
  locked_at: string | null;
  regenerate_count: number;
  error: string | null;
  draft_text: string | null;
  contact_draft_text: string | null;
  edited_text: string | null;
  contact_edited_text: string | null;
  model: string | null;
  asa_from: string;
  asa_to: string;
  yoru_from: string;
  yoru_to: string;
}>;

// 行を書き換える条件(比較して一致したときだけ書き換える。二重作成・連打を防ぐ)。
export type ClaimCondition =
  // 自動作成: 失敗した行(試行回数が上限未満)か、止まった作成中の行だけを取り直す。
  | { kind: "auto"; staleBefore: string; maxAttempts: number }
  // 今すぐ作る・作り直し: 回数が読んだときのまま、かつ作成中(止まっていない)でないこと。
  | { kind: "manual"; regenerateCount: number; staleBefore: string };

export interface LiaisonStore {
  listEnabledSettings(): Promise<LiaisonSettings[]>;
  getSettings(childId: string): Promise<LiaisonSettings | null>;
  getChild(childId: string): Promise<(ChildRow & { created_by: string }) | null>;
  // その人と、同じグループのメンバー(children の RLS と同じ範囲)。
  familyOf(userId: string): Promise<string[]>;
  childrenCreatedBy(userIds: string[]): Promise<ChildRow[]>;
  getMemo(childId: string, dueDate: string): Promise<MemoRow | null>;
  // 一意制約にぶつかったら null。
  insertMemo(row: { child_id: string; due_date: string } & MemoPatch): Promise<MemoRow | null>;
  // 条件に合ったときだけ書き換え、書き換えた行を返す(合わなければ null)。
  claimMemo(id: string, condition: ClaimCondition, patch: MemoPatch): Promise<MemoRow | null>;
  updateMemo(id: string, patch: MemoPatch): Promise<void>;
  asaRecords(userIds: string[], from: string, to: string): Promise<Row[]>;
  yoruRecords(userIds: string[], from: string, to: string): Promise<Row[]>;
  rules(userIds: string[], from: string, to: string): Promise<{ title: string; child_id: string | null; started_on: string; ended_on: string | null }[]>;
  openConcerns(userIds: string[]): Promise<{ title: string }[]>;
  // その子の、直近に「送った」文面(新しい順)。
  sentTexts(childId: string, limit: number): Promise<string[]>;
  // 通知を受け取る人(notify_liaison_memo が false の人を除く。行が無い人は受け取る)の購読。
  subscriptionsFor(userIds: string[]): Promise<(PushSubscriptionRow & { user_id: string })[]>;
  deleteSubscriptions(ids: string[]): Promise<void>;
}

export interface GenerateRequest {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
}
// AI の呼び出し。output は構造化出力をパースしたもの(パースできなければ null)。
export type Generate = (request: GenerateRequest) => Promise<{ output: unknown; model: string }>;

export interface LiaisonDeps {
  store: LiaisonStore;
  generate: Generate;
  send: SendNotification;
}

export function liaisonPayload(): string {
  return JSON.stringify({ title: "よるノート", body: "今週の連絡メモの下書きができました", url: "/memo" });
}

// 利用者に見せる失敗の理由(API キーや内部の情報は含めない)。
export class LiaisonError extends Error {}

interface Produced {
  status: "generated" | "no_records";
}

// 1回分の下書きを作って保存する(行は確保済み)。失敗したら行を failed にして、例外を投げ直す。
async function produce(
  deps: LiaisonDeps,
  memo: MemoRow,
  settings: LiaisonSettings,
  now: Date,
  instruction: string | null,
  attemptsAfter: number
): Promise<Produced> {
  const { store } = deps;
  try {
    const child = await store.getChild(memo.child_id);
    if (!child) throw new LiaisonError("子どもが見つかりませんでした");
    const users = await store.familyOf(child.created_by);
    const children = await store.childrenCreatedBy(users);
    const childCount = children.length;
    const periods = periodsFor(jstParts(now).date);

    const own = (r: Row) => belongsToChild(r.child_id, child.id, childCount);
    const asaRecords = (await store.asaRecords(users, periods.asaFrom, periods.asaTo)).filter(own);
    const yoruRecords = (await store.yoruRecords(users, periods.yoruFrom, periods.yoruTo)).filter(own);
    const periodPatch = { asa_from: periods.asaFrom, asa_to: periods.asaTo, yoru_from: periods.yoruFrom, yoru_to: periods.yoruTo };

    if (asaRecords.length === 0 && yoruRecords.length === 0) {
      await store.updateMemo(memo.id, {
        ...periodPatch,
        status: "no_records",
        locked_at: null,
        error: null,
        attempts: attemptsAfter,
      });
      return { status: "no_records" };
    }

    const rules = (await store.rules(users, periods.yoruFrom, periods.yoruTo)).filter(
      (r) => r.child_id === null || r.child_id === child.id
    );
    // 検討事項は子どもとのつながりを持たないため、子どもが1人の家庭でだけ渡す(仕様 §5.2)。
    const concerns = childCount === 1 ? await store.openConcerns(users) : [];
    const sent = await store.sentTexts(child.id, 3);
    const styleExamples = [...sent, ...settings.style_examples].slice(0, 3);

    const content = buildUserContent(
      { asaRecords, yoruRecords, rules, concerns, styleExamples },
      { targetChars: settings.target_chars, recipientLabel: settings.recipient_label, includeMemo: settings.include_memo },
      children,
      child.id,
      instruction
    );

    const messages: GenerateRequest["messages"] = [{ role: "user", content }];
    let result = await deps.generate({ system: SYSTEM_PROMPT, messages });
    let checked = checkDraft(result.output, settings.target_chars);
    // 文字数が外れたら、1回だけ直してもらう。それでも外れたら、そのまま保存する(画面で文字数が分かる)。
    if (checked.kind === "length") {
      messages.push({ role: "assistant", content: JSON.stringify(result.output) }, { role: "user", content: checked.reason });
      result = await deps.generate({ system: SYSTEM_PROMPT, messages });
      checked = checkDraft(result.output, settings.target_chars);
    }
    if (checked.kind === "invalid" || !checked.draft) throw new LiaisonError(checked.kind === "invalid" ? checked.reason : "下書きを作れませんでした");

    await store.updateMemo(memo.id, {
      ...periodPatch,
      status: "generated",
      draft_text: checked.draft.memo,
      contact_draft_text: checked.draft.contact || null,
      // 作り直したら、前の編集は消える(画面で確かめてから作り直す)。
      edited_text: null,
      contact_edited_text: null,
      model: result.model,
      locked_at: null,
      error: null,
      attempts: attemptsAfter,
    });
    return { status: "generated" };
  } catch (error) {
    // 本文や記録の中身はログに出さない(子どもの情報のため)。
    console.error(`連絡メモの作成に失敗しました(memo=${memo.id}):`, error instanceof Error ? error.name : "unknown");
    await store.updateMemo(memo.id, {
      status: "failed",
      locked_at: null,
      error: error instanceof LiaisonError ? error.message : "下書きを作れませんでした。時間をおいてもう一度お試しください",
      attempts: attemptsAfter,
    });
    throw error;
  }
}

async function notify(deps: LiaisonDeps, childId: string): Promise<number> {
  const child = await deps.store.getChild(childId);
  if (!child) return 0;
  const users = await deps.store.familyOf(child.created_by);
  const subscriptions = await deps.store.subscriptionsFor(users);
  const { sent, staleSubscriptionIds } = await sendToSubscriptions(deps.send, subscriptions, liaisonPayload());
  if (staleSubscriptionIds.length > 0) await deps.store.deleteSubscriptions(staleSubscriptionIds);
  return sent;
}

// cron から: 予定の時刻を過ぎた子どもの、今の回の下書きを作り、通知する(仕様 §4.2)。
export async function runAuto(deps: LiaisonDeps, now: Date): Promise<Record<string, number>> {
  const { store } = deps;
  const staleBefore = new Date(now.getTime() - LOCK_STALE_MS).toISOString();
  const counts = { due: 0, generated: 0, no_records: 0, failed: 0, notified: 0 };

  for (const settings of await store.listEnabledSettings()) {
    if (!settings.consented_at) continue;
    const dueDate = autoDueDate(now, settings.weekday, settings.hour);
    if (!dueDate) continue;
    if (counts.generated + counts.no_records + counts.failed >= MAX_CHILDREN_PER_RUN) break;

    const lock = { status: "generating" as const, locked_at: now.toISOString() };
    let memo = await store.insertMemo({ child_id: settings.child_id, due_date: dueDate, ...lock });
    if (!memo) {
      const existing = await store.getMemo(settings.child_id, dueDate);
      if (!existing) continue;
      memo = await store.claimMemo(existing.id, { kind: "auto", staleBefore, maxAttempts: MAX_AUTO_ATTEMPTS }, lock);
      if (!memo) continue; // 作成済み・作成中・試行の上限
    }
    counts.due += 1;

    try {
      const { status } = await produce(deps, memo, settings, now, null, memo.attempts + 1);
      counts[status] += 1;
      if (status === "generated") counts.notified += await notify(deps, settings.child_id);
    } catch {
      counts.failed += 1;
    }
  }
  return counts;
}

export type ManualResult =
  | { ok: true; status: "generated" | "no_records" }
  | { ok: false; code: "not_found" | "not_enabled" | "limit" | "busy" | "failed"; message: string };

// 画面から: 「今すぐ作る」(今の回がまだ無い)・「作り直す」。通知は送らない(仕様 §7・§9)。
export async function runManual(
  deps: LiaisonDeps,
  now: Date,
  userId: string,
  childId: string,
  rawInstruction: string | null
): Promise<ManualResult> {
  const { store } = deps;
  const child = await store.getChild(childId);
  // 子どもが見えない人には、存在するかどうかも分からないよう、同じ応答にする。
  if (!child || !(await store.familyOf(child.created_by)).includes(userId)) {
    return { ok: false, code: "not_found", message: "子どもが見つかりませんでした" };
  }
  const settings = await store.getSettings(childId);
  if (!settings?.enabled || !settings.consented_at) {
    return { ok: false, code: "not_enabled", message: "連絡メモの下書きがオフになっています。設定でオンにしてください" };
  }
  const instruction = rawInstruction?.trim().slice(0, INSTRUCTION_MAX_CHARS) || null;
  const dueDate = upcomingDueDate(now, settings.weekday);
  const staleBefore = new Date(now.getTime() - LOCK_STALE_MS).toISOString();
  const lock = { status: "generating" as const, locked_at: now.toISOString() };

  let memo = await store.insertMemo({ child_id: childId, due_date: dueDate, regenerate_count: 1, ...lock });
  if (!memo) {
    const existing = await store.getMemo(childId, dueDate);
    if (!existing) return { ok: false, code: "busy", message: "ほかの操作と重なりました。もう一度お試しください" };
    if (existing.regenerate_count >= MAX_REGENERATIONS) {
      return { ok: false, code: "limit", message: `作り直しは1回につき${MAX_REGENERATIONS}回までです` };
    }
    memo = await store.claimMemo(
      existing.id,
      { kind: "manual", regenerateCount: existing.regenerate_count, staleBefore },
      { ...lock, regenerate_count: existing.regenerate_count + 1 }
    );
    if (!memo) return { ok: false, code: "busy", message: "いま作成中です。少し待ってから開き直してください" };
  }

  try {
    const { status } = await produce(deps, memo, settings, now, instruction, memo.attempts);
    return { ok: true, status };
  } catch (error) {
    return {
      ok: false,
      code: "failed",
      message: error instanceof LiaisonError ? error.message : "下書きを作れませんでした。時間をおいてもう一度お試しください",
    };
  }
}
