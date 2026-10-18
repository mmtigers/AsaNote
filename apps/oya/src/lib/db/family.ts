import { db } from "@/lib/supabase";

// 家族・メンバー・招待の読み書き。権限の検証はサーバー(RLS と DB の関数)が行う(supabase/schema.sql)。
// ここは呼び出しと、エラーをそのまま投げることだけを受け持つ(画面側で describeServerError を通して表示する)。

export type Role = "parent" | "admin" | "viewer";

export const ROLE_LABELS: Record<Role, string> = {
  parent: "親(記録する人)",
  admin: "家族管理者",
  viewer: "家族閲覧者",
};

export function isRole(value: string): value is Role {
  return value === "parent" || value === "admin" || value === "viewer";
}

export interface Member {
  userId: string;
  familyId: string;
  role: Role;
  displayName: string;
  joinedAt: string;
}

export interface Invite {
  id: string;
  code: string;
  role: Role;
  displayName: string;
  expiresAt: string;
  usedAt: string | null;
}

type MemberRow = { user_id: string; family_id: string; role: string; display_name: string; joined_at: string };

function toMember(row: MemberRow): Member {
  // DB の check 制約で3種類に限られる。型の上でも絞る(想定外の値は閲覧者として扱い、権限を広げない)。
  return {
    userId: row.user_id,
    familyId: row.family_id,
    role: isRole(row.role) ? row.role : "viewer",
    displayName: row.display_name,
    joinedAt: row.joined_at,
  };
}

/** ログイン中の人の所属。家族に属していなければ null。 */
export async function fetchMyMembership(userId: string): Promise<Member | null> {
  const { data, error } = await db()
    .from("oya_members")
    .select("user_id, family_id, role, display_name, joined_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? toMember(data) : null;
}

/** 同じ家族のメンバー(参加の順)。 */
export async function fetchFamilyMembers(): Promise<Member[]> {
  const { data, error } = await db()
    .from("oya_members")
    .select("user_id, family_id, role, display_name, joined_at")
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return data.map(toMember);
}

/** 未使用で期限内の招待コード(家族管理者だけが読める。それ以外の人には空)。 */
export async function fetchActiveInvites(): Promise<Invite[]> {
  const { data, error } = await db()
    .from("oya_invites")
    .select("id, code, role, display_name, expires_at, used_at")
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    code: row.code,
    role: isRole(row.role) ? row.role : "viewer",
    displayName: row.display_name,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
  }));
}

/** 家族を作り、自分が最初の家族管理者になる。 */
export async function createFamily(displayName: string): Promise<string> {
  const { data, error } = await db().rpc("create_oya_family", { p_display_name: displayName.trim() });
  if (error) throw error;
  return data;
}

/** 招待コードで家族に参加する(役割と呼び名は、発行した家族管理者が決めたもの)。 */
export async function redeemInvite(code: string): Promise<string> {
  const { data, error } = await db().rpc("redeem_oya_invite", { p_code: normalizeInviteCode(code) });
  if (error) throw error;
  return data;
}

/** 招待コードを発行する(家族管理者だけ)。 */
export async function createInvite(role: Role, displayName: string): Promise<string> {
  const { data, error } = await db().rpc("create_oya_invite", { p_role: role, p_display_name: displayName.trim() });
  if (error) throw error;
  return data;
}

/** 招待コードを取り消す(家族管理者だけ)。 */
export async function deleteInvite(id: string): Promise<void> {
  const { error } = await db().from("oya_invites").delete().eq("id", id);
  if (error) throw error;
}

/** メンバーを家族から外す(家族管理者は誰でも、それ以外の人は自分だけ)。 */
export async function removeMember(userId: string): Promise<void> {
  const { error } = await db().rpc("remove_oya_member", { p_user_id: userId });
  if (error) throw error;
}

/** メンバーの役割を変える(家族管理者だけ)。 */
export async function setMemberRole(userId: string, role: Role): Promise<void> {
  const { error } = await db().rpc("set_oya_member_role", { p_user_id: userId, p_role: role });
  if (error) throw error;
}

/** 入力された招待コードの空白・ハイフンを除き、大文字にする(コードは英大文字と数字の8桁)。 */
export function normalizeInviteCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}
