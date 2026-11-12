// 連絡メモの下書き(apps/yoru/docs/liaison-memo.md)の、日付と時刻の計算。Deno・Supabase に依存しない純粋な関数で、
// Vitest でテストする(liaisonSchedule.test.ts)。日付は日本時間の "YYYY-MM-DD"(DB の date 列と同じ形)で扱う。

// 予定の時刻を過ぎてから、自動で作る(cron が拾う)のを続ける長さ(仕様 §4.2)。過ぎたら「今すぐ作る」で作る。
export const AUTO_WINDOW_HOURS = 3;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// 日本時間の日付・曜日(0=日〜6=土)・時。
export function jstParts(now: Date): { date: string; weekday: number; hour: number } {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  return { date: jst.toISOString().slice(0, 10), weekday: jst.getUTCDay(), hour: jst.getUTCHours() };
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

// 予定日 date の設定の時刻(日本時間)を、Date にする。
export function dueAt(date: string, hour: number): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) + hour * 60 * 60 * 1000 - JST_OFFSET_MS);
}

// 今の回の予定日: 今日以降で、設定の曜日に当たる最も近い日(今日が当たるなら今日)。「今すぐ作る」が使う(仕様 §4.1)。
export function upcomingDueDate(now: Date, weekday: number): string {
  const { date, weekday: today } = jstParts(now);
  return addDays(date, (weekday - today + 7) % 7);
}

// 自動で作る回の予定日。予定の日時を過ぎて AUTO_WINDOW_HOURS 以内なら、その予定日を返す(無ければ null)。
// 23時の設定で日付をまたいでも拾えるよう、今日と昨日の両方を候補にする。
export function autoDueDate(now: Date, weekday: number, hour: number): string | null {
  const { date } = jstParts(now);
  for (const candidate of [date, addDays(date, -1)]) {
    if (weekdayOf(candidate) !== weekday) continue;
    const start = dueAt(candidate, hour).getTime();
    if (now.getTime() >= start && now.getTime() < start + AUTO_WINDOW_HOURS * 60 * 60 * 1000) return candidate;
  }
  return null;
}

// 対象期間(仕様 §4.3)。X は作成した日(日本時間)。前回の作成後に記録される「予定日の夜」を取りこぼさないよう、
// あさノートは X-6〜X(当日の朝を含む)、よるノートは X-7〜X-1(当日の夜は含まない)。
export function periodsFor(createdOn: string): { asaFrom: string; asaTo: string; yoruFrom: string; yoruTo: string } {
  return {
    asaFrom: addDays(createdOn, -6),
    asaTo: createdOn,
    yoruFrom: addDays(createdOn, -7),
    yoruTo: addDays(createdOn, -1),
  };
}
