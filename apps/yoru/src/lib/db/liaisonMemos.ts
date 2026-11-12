"use client";

import { getSupabaseClient } from "@note/core/supabase/client";
import {
  DEFAULT_LIAISON_SETTINGS,
  INSTRUCTION_MAX,
  RECIPIENT_LABEL_MAX,
  STYLE_EXAMPLE_MAX,
  STYLE_EXAMPLES_MAX_COUNT,
  type LiaisonMemo,
  type LiaisonSettings,
  type MemoStatus,
} from "@/lib/liaisonMemo";

// 連絡メモの下書き(docs/liaison-memo.md)。設定と下書きは家族で共有する設定情報なので、
// 試したこと・検討事項と同じく、オンライン時に Supabase へ直接読み書きする(Dexie へのミラーリングはしない)。
// 権限はサーバー(RLS・列の権限・トリガー)が守る。下書きを作るのは Edge Function(generate-liaison-memos)。

type Row = Record<string, unknown>;

function toSettings(row: Row): LiaisonSettings {
  return {
    childId: row.child_id as string,
    enabled: row.enabled as boolean,
    consentedBy: (row.consented_by as string | null) ?? null,
    consentedAt: (row.consented_at as string | null) ?? null,
    weekday: row.weekday as number,
    hour: row.hour as number,
    targetChars: row.target_chars as number,
    recipientLabel: row.recipient_label as string,
    includeMemo: row.include_memo as boolean,
    styleExamples: (row.style_examples as string[] | null) ?? [],
    updatedBy: (row.updated_by as string | null) ?? null,
    updatedAt: (row.updated_at as string | null) ?? null,
  };
}

function toMemo(row: Row): LiaisonMemo {
  return {
    id: row.id as string,
    childId: row.child_id as string,
    dueDate: row.due_date as string,
    status: row.status as MemoStatus,
    error: (row.error as string | null) ?? null,
    draftText: (row.draft_text as string | null) ?? null,
    editedText: (row.edited_text as string | null) ?? null,
    contactDraftText: (row.contact_draft_text as string | null) ?? null,
    contactEditedText: (row.contact_edited_text as string | null) ?? null,
    finalText: (row.final_text as string | null) ?? null,
    sentAt: (row.sent_at as string | null) ?? null,
    sentBy: (row.sent_by as string | null) ?? null,
    regenerateCount: (row.regenerate_count as number) ?? 0,
    asaFrom: (row.asa_from as string | null) ?? null,
    asaTo: (row.asa_to as string | null) ?? null,
    yoruFrom: (row.yoru_from as string | null) ?? null,
    yoruTo: (row.yoru_to as string | null) ?? null,
  };
}

// 子どもごとの設定。行が無い子どもは既定値(オフ)で返す。
export async function fetchLiaisonSettings(childIds: string[]): Promise<Map<string, LiaisonSettings>> {
  const result = new Map<string, LiaisonSettings>();
  for (const childId of childIds) result.set(childId, { childId, ...DEFAULT_LIAISON_SETTINGS });
  if (childIds.length === 0) return result;
  const { data, error } = await getSupabaseClient().from("liaison_memo_settings").select("*").in("child_id", childIds);
  if (error) throw error;
  for (const row of (data ?? []) as Row[]) result.set(row.child_id as string, toSettings(row));
  return result;
}

export function validateSettings(settings: LiaisonSettings): string | null {
  const label = settings.recipientLabel.trim();
  if (!label) return "宛先の呼び名を入力してください";
  if (label.length > RECIPIENT_LABEL_MAX) return `宛先の呼び名は${RECIPIENT_LABEL_MAX}文字以内で入力してください`;
  if (settings.styleExamples.length > STYLE_EXAMPLES_MAX_COUNT) return `書き方の見本は${STYLE_EXAMPLES_MAX_COUNT}件までです`;
  if (settings.styleExamples.some((e) => e.length > STYLE_EXAMPLE_MAX)) return `書き方の見本は1件${STYLE_EXAMPLE_MAX}文字以内で入力してください`;
  return null;
}

// 設定を保存する。同意した人・変えた人と日時は、サーバーのトリガーが入れる(ここでは送らない)。
export async function saveLiaisonSettings(settings: LiaisonSettings): Promise<LiaisonSettings> {
  const problem = validateSettings(settings);
  if (problem) throw new Error(problem);
  const { data, error } = await getSupabaseClient()
    .from("liaison_memo_settings")
    .upsert({
      child_id: settings.childId,
      enabled: settings.enabled,
      weekday: settings.weekday,
      hour: settings.hour,
      target_chars: settings.targetChars,
      recipient_label: settings.recipientLabel.trim(),
      include_memo: settings.includeMemo,
      // 空の見本は送らない(サーバーは空の要素を拒否する)。
      style_examples: settings.styleExamples.map((e) => e.trim()).filter(Boolean),
    })
    .select()
    .single();
  if (error) throw error;
  return toSettings(data as Row);
}

// その子の直近の連絡メモ(予定日の新しい順)。
export async function fetchLiaisonMemos(childId: string, limit = 12): Promise<LiaisonMemo[]> {
  const { data, error } = await getSupabaseClient()
    .from("liaison_memos")
    .select("*")
    .eq("child_id", childId)
    .order("due_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toMemo);
}

// 編集した本文を保存する(列の権限で、クライアントが書けるのは編集・最終版・送ったの列だけ)。
export async function saveMemoEdits(id: string, editedText: string, contactEditedText: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("liaison_memos")
    .update({ edited_text: editedText, contact_edited_text: contactEditedText })
    .eq("id", id);
  if (error) throw error;
}

// 「送った」。送った日時と押した人は、サーバーのトリガーが入れる。
export async function markMemoSent(id: string, finalText: string): Promise<void> {
  const { error } = await getSupabaseClient()
    .from("liaison_memos")
    .update({ final_text: finalText, sent_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// 「送った」の取り消し。最終版もサーバーのトリガーが消す。
export async function unmarkMemoSent(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from("liaison_memos").update({ sent_at: null }).eq("id", id);
  if (error) throw error;
}

// 「今すぐ作る」「作り直す」。Edge Function が、子どもが見える人か・回数の上限を確かめてから作る。
export async function requestLiaisonDraft(childId: string, instruction: string | null): Promise<void> {
  const { data, error } = await getSupabaseClient().functions.invoke("generate-liaison-memos", {
    body: { child_id: childId, instruction: instruction?.trim().slice(0, INSTRUCTION_MAX) || null },
  });
  if (error) {
    // 関数が返した利用者向けの文(message)があれば、それを出す。
    const context = (error as { context?: Response }).context;
    const body = context && typeof context.json === "function" ? await context.json().catch(() => null) : null;
    throw new Error((body as { message?: string } | null)?.message ?? "下書きを作れませんでした。時間をおいてもう一度お試しください");
  }
  if (data && (data as { ok?: boolean }).ok === false) {
    throw new Error((data as { message?: string }).message ?? "下書きを作れませんでした");
  }
}
