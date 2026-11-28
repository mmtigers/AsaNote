// 制作時の年齢と、部屋(学年)の決まり(docs/SPEC.md §5.3・§5.4)。日付は "YYYY-MM-DD" の文字列で扱う
// (タイムゾーンの影響を受けないよう、Date には変換しない)。

interface YMD {
  y: number;
  m: number;
  d: number;
}

function parse(date: string): YMD {
  const [y, m, d] = date.split("-").map(Number);
  return { y: y ?? 0, m: m ?? 0, d: d ?? 0 };
}

/** 誕生日から見た、ある日の年齢(満年齢と、何か月か)。ある日が誕生日より前なら null。 */
export function ageAt(birthDate: string, date: string): { years: number; months: number } | null {
  const b = parse(birthDate);
  const t = parse(date);
  let months = (t.y - b.y) * 12 + (t.m - b.m);
  if (t.d < b.d) months -= 1;
  if (months < 0) return null;
  return { years: Math.floor(months / 12), months: months % 12 };
}

/** 「5歳3か月」。誕生日が無い・ある日が誕生日より前なら空文字。 */
export function formatAge(birthDate: string | null | undefined, date: string): string {
  if (!birthDate) return "";
  const age = ageAt(birthDate, date);
  return age ? `${age.years}歳${age.months}か月` : "";
}

/** 年度(4月〜翌年3月)。2026-03-31 は 2025 年度。 */
export function fiscalYear(date: string): number {
  const { y, m } = parse(date);
  return m >= 4 ? y : y - 1;
}

/**
 * 部屋の名前(§5.4)。その年度の4月1日時点の満年齢で決める。
 * 4月1日生まれは、その日に年齢が上がるので早生まれの学年に入る(日本の学年の決まり: 4月2日〜翌年4月1日生まれが同じ学年)。
 * 誕生日が無い・中学生以降・生まれる前の年度は「〇〇年度の部屋」。
 */
export function roomName(birthDate: string | null | undefined, fy: number): string {
  const fallback = `${fy}年度の部屋`;
  if (!birthDate) return fallback;
  const age = ageAt(birthDate, `${fy}-04-01`);
  if (!age) return fallback;
  const a = age.years;
  if (a <= 2) return `${a}歳児の部屋`;
  if (a <= 5) return `${["年少", "年中", "年長"][a - 3]}の部屋`;
  if (a <= 11) return `${a - 5}年生の部屋`;
  return fallback;
}
