import { getSupabaseClient } from "./supabase/client";

// 「試したこと」と検討事項ボード(よるノート SPEC §4.4・あさノート SPEC)。children と同じく、家族の設定情報として
// オンライン時にSupabaseへ直接読み書きする(Dexieへのミラーリングはしない)。
// 読み書きの手順は両アプリで同じで、違うのはテーブル名だけ。テーブル名はアプリから渡す
// (よるノートは evening_rules / evening_concerns、あさノートは morning_rules / morning_concerns)。
export const RULE_TITLE_MAX = 100;
export const CONCERN_TITLE_MAX = 200;

export interface Rule {
  id: string;
  user_id: string;
  child_id: string | null; // null = 子ども全員
  title: string;
  started_on: string; // "YYYY-MM-DD"
  ended_on: string | null;
  created_at: string;
}

export interface Concern {
  id: string;
  user_id: string;
  child_id: string | null; // null = 子ども全員(#298)
  title: string;
  resolved_at: string | null;
  created_at: string;
}

export interface BoardTables {
  rules: string;
  concerns: string;
}

export interface BoardApi {
  getRules(): Promise<Rule[]>;
  createRule(input: { title: string; startedOn: string; childId: string | null }): Promise<void>;
  /** 終了日を入れると「やめた」扱いになり、空に戻せば再開できる。 */
  setRuleEnded(id: string, endedOn: string | null): Promise<void>;
  deleteRule(id: string): Promise<void>;
  getConcerns(): Promise<Concern[]>;
  createConcern(input: { title: string; childId: string | null }): Promise<void>;
  setConcernResolved(id: string, resolved: boolean): Promise<void>;
  deleteConcern(id: string): Promise<void>;
}

function validateTitle(title: string, max: number, label: string): string {
  const trimmed = title.trim();
  if (!trimmed) throw new Error(`${label}を入力してください`);
  if (trimmed.length > max) throw new Error(`${label}は${max}文字以内で入力してください`);
  return trimmed;
}

async function requireUserId(): Promise<string> {
  const { data } = await getSupabaseClient().auth.getUser();
  if (!data.user?.id) throw new Error("ログインが必要です");
  return data.user.id;
}

export function createBoardApi(tables: BoardTables): BoardApi {
  const db = () => getSupabaseClient();
  return {
    async getRules() {
      const { data, error } = await db().from(tables.rules).select("*").order("started_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Rule[];
    },

    async createRule(input) {
      const title = validateTitle(input.title, RULE_TITLE_MAX, "内容");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startedOn)) throw new Error("開始日を入力してください");
      const userId = await requireUserId();
      const { error } = await db()
        .from(tables.rules)
        .insert({ user_id: userId, title, started_on: input.startedOn, child_id: input.childId });
      if (error) throw error;
    },

    async setRuleEnded(id, endedOn) {
      const { error } = await db().from(tables.rules).update({ ended_on: endedOn }).eq("id", id);
      if (error) throw error;
    },

    async deleteRule(id) {
      const { error } = await db().from(tables.rules).delete().eq("id", id);
      if (error) throw error;
    },

    async getConcerns() {
      const { data, error } = await db().from(tables.concerns).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Concern[];
    },

    async createConcern(input) {
      const title = validateTitle(input.title, CONCERN_TITLE_MAX, "内容");
      const userId = await requireUserId();
      const { error } = await db().from(tables.concerns).insert({ user_id: userId, title, child_id: input.childId });
      if (error) throw error;
    },

    async setConcernResolved(id, resolved) {
      const { error } = await db()
        .from(tables.concerns)
        .update({ resolved_at: resolved ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },

    async deleteConcern(id) {
      const { error } = await db().from(tables.concerns).delete().eq("id", id);
      if (error) throw error;
    },
  };
}
