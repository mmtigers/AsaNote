"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthStatus } from "@/components/AuthStatus";
import { SkeletonList } from "@/components/Skeleton";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  CONCERN_TITLE_MAX,
  RULE_TITLE_MAX,
  createConcern,
  createRule,
  deleteConcern,
  deleteRule,
  getConcerns,
  getRules,
  setConcernResolved,
  setRuleEnded,
  type Concern,
  type Rule,
} from "@/lib/db/board";
import { useChildren } from "@/lib/db/children";
import { useRecordsTimeline } from "@/lib/db/queries";
import { formatDateShort, toDateInputValue } from "@/lib/date";
import { describeErrorForUser } from "@/lib/errors";
import { formatMinutes } from "@/app/stats/aggregate";
import { compareAroundRule, COMPARE_WINDOW_DAYS, type PeriodSummary } from "./compare";

const CARD = "rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm";
const INPUT = "w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-sm";
const BTN = "rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-[var(--accent-ink)] disabled:opacity-50";
const SUBTLE = "text-xs font-semibold text-[var(--sub)]";

function PeriodColumn({ label, p }: { label: string; p: PeriodSummary }) {
  return (
    <div className="flex-1 rounded-2xl bg-[var(--surface-2)] p-3 text-center">
      <p className="text-[11px] text-[var(--sub)]">{label}</p>
      <p className="mt-1 text-[11px] text-[var(--sub)]">
        {formatDateShort(p.from)}〜{formatDateShort(p.to)}
      </p>
      {p.total === 0 ? (
        <p className="mt-2 text-sm text-[var(--sub)]">記録なし</p>
      ) : (
        <>
          <p className="mt-2 text-lg font-bold tabular-nums">{p.roughRate}%</p>
          <p className="text-[11px] text-[var(--sub)]">荒れた({p.total}件中)</p>
          <p className="mt-1.5 text-[13px] font-semibold tabular-nums">
            {p.averageBedMinutes === null ? "消灯 -" : `消灯 ${formatMinutes(p.averageBedMinutes)}`}
          </p>
          {p.averageBedMinutes !== null && <p className="text-[11px] text-[var(--sub)]">({p.bedCount}件の平均)</p>}
        </>
      )}
    </div>
  );
}

function RuleCard({
  rule,
  childName,
  today,
  records,
  onChanged,
  onError,
}: {
  rule: Rule;
  childName: string | null;
  today: string;
  records: NonNullable<ReturnType<typeof useRecordsTimeline>>;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const comparison = useMemo(() => {
    const scoped = records.filter((r) => rule.child_id === null || r.childId === rule.child_id);
    return compareAroundRule(scoped, { startedOn: rule.started_on, endedOn: rule.ended_on }, today);
  }, [records, rule, today]);

  async function run(action: () => Promise<void>, failure: string) {
    try {
      await action();
      onChanged();
    } catch (e) {
      console.error(e);
      onError(describeErrorForUser(e, failure));
    }
  }

  return (
    <article className={CARD}>
      <h3 className="text-[15px] font-bold">{rule.title}</h3>
      <p className="mt-1 text-[11px] text-[var(--sub)]">
        {formatDateShort(rule.started_on)}から{rule.ended_on ? `${formatDateShort(rule.ended_on)}まで` : "続けている"}
        {childName ? ` ・ ${childName}` : ""}
      </p>
      <div className="mt-3 flex gap-2">
        <PeriodColumn label="始める前" p={comparison.before} />
        <PeriodColumn label="始めてから" p={comparison.after} />
      </div>
      <p className="mt-2 text-[11px] text-[var(--sub)]">
        前後それぞれ最大{COMPARE_WINDOW_DAYS}日。件数が少ないうちは目安として見てください。
      </p>
      <div className="mt-3 flex gap-4">
        <button
          type="button"
          className={SUBTLE}
          onClick={() => void run(() => setRuleEnded(rule.id, rule.ended_on ? null : today), "更新に失敗しました")}
        >
          {rule.ended_on ? "再開する" : "やめた日を今日にする"}
        </button>
        <button
          type="button"
          className={SUBTLE}
          onClick={() => {
            if (window.confirm("この項目を削除しますか?")) void run(() => deleteRule(rule.id), "削除に失敗しました");
          }}
        >
          削除
        </button>
      </div>
    </article>
  );
}

export default function RulesPage() {
  const { session, loading: authLoading } = useAuth();
  const children = useChildren();
  const records = useRecordsTimeline();
  const today = useMemo(() => toDateInputValue(new Date()), []);

  const [rules, setRules] = useState<Rule[] | null>(null);
  const [concerns, setConcerns] = useState<Concern[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [ruleTitle, setRuleTitle] = useState("");
  const [ruleStart, setRuleStart] = useState(today);
  const [ruleChild, setRuleChild] = useState<string>("");
  const [concernTitle, setConcernTitle] = useState("");

  const reload = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([getRules(), getConcerns()]);
      setRules(r);
      setConcerns(c);
    } catch (e) {
      console.error(e);
      setError(describeErrorForUser(e, "読み込みに失敗しました(オンラインでご利用ください)"));
      setRules((cur) => cur ?? []);
      setConcerns((cur) => cur ?? []);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !session) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- マウント/ログイン確定後の初回取得
    void reload();
  }, [authLoading, session, reload]);

  async function submit(action: () => Promise<void>, failure: string, reset: () => void) {
    setError(null);
    try {
      await action();
      reset();
      await reload();
    } catch (e) {
      console.error(e);
      setError(describeErrorForUser(e, failure));
    }
  }

  const childList = children ?? [];
  const childName = (id: string | null) => (id ? (childList.find((c) => c.id === id)?.name ?? null) : null);
  const open = concerns?.filter((c) => !c.resolved_at) ?? [];
  const resolved = concerns?.filter((c) => c.resolved_at) ?? [];

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6">
      <header className="flex items-start justify-between gap-3">
        <h1 className="text-lg font-bold">💡 試したこと</h1>
        <AuthStatus />
      </header>

      {!authLoading && !session && (
        <p className={`${CARD} text-sm text-[var(--sub)]`}>ログインすると、家族で共有できます。</p>
      )}
      {error && (
        <p role="alert" className="rounded-2xl bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--sub)]">
          {error}
        </p>
      )}

      {session && (rules === null || concerns === null ? (
        <SkeletonList />
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-bold">ルール変更の記録</h2>
            <form
              className={`${CARD} flex flex-col gap-2.5`}
              onSubmit={(e) => {
                e.preventDefault();
                void submit(
                  () => createRule({ title: ruleTitle, startedOn: ruleStart, childId: ruleChild || null }),
                  "登録に失敗しました",
                  () => setRuleTitle("")
                );
              }}
            >
              <input
                className={INPUT}
                placeholder="例: 食洗機は18:45まで"
                maxLength={RULE_TITLE_MAX}
                value={ruleTitle}
                onChange={(e) => setRuleTitle(e.target.value)}
                aria-label="試したこと"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  className={INPUT}
                  value={ruleStart}
                  onChange={(e) => setRuleStart(e.target.value)}
                  aria-label="開始日"
                />
                {childList.length >= 2 && (
                  <select className={INPUT} value={ruleChild} onChange={(e) => setRuleChild(e.target.value)} aria-label="対象の子ども">
                    <option value="">全員</option>
                    {childList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <button type="submit" className={BTN} disabled={!ruleTitle.trim() || !ruleStart}>
                試したことを登録
              </button>
            </form>
            {rules.map((r) => (
              <RuleCard
                key={r.id}
                rule={r}
                childName={childList.length >= 2 ? childName(r.child_id) : null}
                today={today}
                records={records ?? []}
                onChanged={() => void reload()}
                onError={setError}
              />
            ))}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-bold">検討事項ボード</h2>
            <form
              className={`${CARD} flex gap-2`}
              onSubmit={(e) => {
                e.preventDefault();
                void submit(() => createConcern(concernTitle), "追加に失敗しました", () => setConcernTitle(""));
              }}
            >
              <input
                className={INPUT}
                placeholder="困っていること"
                maxLength={CONCERN_TITLE_MAX}
                value={concernTitle}
                onChange={(e) => setConcernTitle(e.target.value)}
                aria-label="困っていること"
              />
              <button type="submit" className={`${BTN} flex-none`} disabled={!concernTitle.trim()}>
                追加
              </button>
            </form>
            <ul className="flex flex-col gap-2">
              {[...open, ...resolved].map((c) => {
                const done = !!c.resolved_at;
                return (
                  <li key={c.id} className={`${CARD} flex items-center gap-3 py-3`}>
                    <input
                      type="checkbox"
                      className="h-5 w-5 flex-none"
                      checked={done}
                      aria-label={`${c.title}を解決済みにする`}
                      onChange={() => void submit(() => setConcernResolved(c.id, !done), "更新に失敗しました", () => {})}
                    />
                    <span className={`flex-1 text-sm ${done ? "text-[var(--sub)] line-through" : ""}`}>{c.title}</span>
                    <button
                      type="button"
                      className={SUBTLE}
                      onClick={() => {
                        if (window.confirm("この項目を削除しますか?")) void submit(() => deleteConcern(c.id), "削除に失敗しました", () => {});
                      }}
                    >
                      削除
                    </button>
                  </li>
                );
              })}
              {concerns.length === 0 && <li className="text-sm text-[var(--sub)]">まだありません。</li>}
            </ul>
          </section>
        </>
      ))}
    </main>
  );
}
