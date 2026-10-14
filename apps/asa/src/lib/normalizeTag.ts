// 理由タグ(自由入力を含む)の表記をそろえる。
//
// 自由入力のタグは、そのまま次回以降の選択肢と集計の単位になる。末尾に「、」「。」が
// 付いただけで別のタグとして数えられ、CSV の区切り文字(「、」)とも紛らわしくなるため、
// 入力時と、保存済みの記録を読むときの両方でここを通す。保存済みのデータは書き換えない。

// タグの最大文字数。これを超える内容はメモ欄に書く。
export const TAG_MAX_LENGTH = 20;

const EDGE_NOISE = /^[\s、。,，.．!！]+|[\s、。,，.．!！]+$/g;

export function normalizeTag(tag: string): string {
  return tag
    .replace(/、/g, " ")
    .replace(EDGE_NOISE, "")
    .replace(/\s+/g, " ");
}

// 正規化したうえで、空になったものと重複を除く(最初に現れた順を保つ)。
export function normalizeTags(tags: readonly string[]): string[] {
  return Array.from(new Set(tags.map(normalizeTag).filter((t) => t !== "")));
}
