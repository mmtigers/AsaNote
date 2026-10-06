// 記録の所有判定を1箇所に集約する(#62)。
// 以前は同じ述語が groups.ts の isOwnRecord・records.ts・queries.ts の3箇所に
// 別実装で散っており、片方だけ直すと挙動がずれる状態だった。
//
// React にも Supabase にも依存させないこと。records.ts / queries.ts のような
// 非 React モジュールから import するため、groups.ts(useGroupMembers を持つ)には置けない。

export interface OwnableRecord {
  userId?: string | null;
}

/**
 * その記録が自分のものか。
 *
 * `userId` 未設定はクラウド未同期の自分の新規記録なので自分のものとして扱う。
 * `authLoading` 中(= currentUserId がまだ確定していない)は楽観的に true を返す。
 * ここで false にすると、自分の記録に「パートナーの記録」ラベルが一瞬出たり、
 * エクスポート対象が一時的に空になったりする。
 *
 * **編集・削除の導線を出すかの判定には使わないこと。** その用途には
 * `canEditRecord()` を使う(#62)。
 */
export function isOwnRecord(
  record: OwnableRecord,
  currentUserId: string | null | undefined,
  authLoading?: boolean
): boolean {
  if (authLoading) return true;
  return !record.userId || record.userId === currentUserId;
}

/**
 * その記録に編集・削除の導線を出してよいか。
 *
 * `isOwnRecord()` と違い `authLoading` 中は false を返す。所有者が確定する前に
 * 導線を出すと、パートナーの記録に「編集する」「削除する」が一瞬表示される。
 * 削除を押すとサーバー側は RLS が拒否するが、ローカル(Dexie)からは消えてしまい、
 * 次の pull まで手元からパートナーの記録が失われる(#62)。
 *
 * 表示が一瞬遅れるだけの表示系と違い、破壊的操作は取り返しがつかないので
 * こちらは保守的に倒す。
 */
export function canEditRecord(
  record: OwnableRecord,
  currentUserId: string | null | undefined,
  authLoading?: boolean
): boolean {
  if (authLoading) return false;
  return isOwnRecord(record, currentUserId);
}
