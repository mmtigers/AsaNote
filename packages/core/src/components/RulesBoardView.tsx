"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { SkeletonList } from "./Skeleton";
import { CONCERN_TITLE_MAX, RULE_TITLE_MAX, type BoardApi, type Concern, type Rule } from "../board";
import { formatDateShort, toDateInputValue } from "../date";
import { describeErrorForUser } from "../errors";

const CARD = "rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm";
const INPUT = "w-full rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-sm";
const BTN = "rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-[var(--accent-ink)] disabled:opacity-50";
const SUBTLE = "text-xs font-semibold text-[var(--sub)]";

// 前後比較の1期間ぶんの表示。数え方(何を「荒れた」「行き渋った」とするか、どの時刻を見るか)はアプリごとに違うので、
// 表示する値はアプリ側で作って渡す。
export interface RulePeriodView {
  from: string;
  to: string;
  total: number;
  /** 割合(百分率)。total が 0 のときは表示しない。 */
  rate: number;
  /** 割合の下に出す説明。例: "荒れた(5件中)" */
  rateCaption: string;
  /** 時刻の欄。例: "消灯 21時以降" */
  detail: string;
  /** 時刻の欄の補足。無ければ出さない。 */
  detailNote: string | null;
}

export function RulePeriodColumn({ label, p }: { label: string; p: RulePeriodView }) {
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
          <p className="mt-2 text-lg font-bold tabular-nums">{p.rate}%</p>
          <p className="text-[11px] text-[var(--sub)]">{p.rateCaption}</p>
          <p className="mt-1.5 text-[13px] font-semibold tabular-nums">{p.detail}</p>
          {p.detailNote !== null && <p className="text-[11px] text-[var(--sub)]">{p.detailNote}</p>}
        </>
      )}
    </div>
  );
}

// 「始める前」「始めてから」を横に並べ、注意書きを添える。
export function RuleComparisonPanel({ before, after, windowDays }: { before: RulePeriodView; after: RulePeriodView; windowDays: number }) {
  return (
    <>
      <div className="mt-3 flex gap-2">
        <RulePeriodColumn label="始める前" p={before} />
        <RulePeriodColumn label="始めてから" p={after} />
      </div>
      <p className="mt-2 text-[11px] text-[var(--sub)]">前後それぞれ最大{windowDays}日。件数が少ないうちは目安として見てください。</p>
    </>
  );
}

function RuleCard({
  api,
  rule,
  childName,
  today,
  comparison,
  onChanged,
  onError,
}: {
  api: BoardApi;
  rule: Rule;
  childName: string | null;
  today: string;
  comparison: ReactNode;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      {comparison}
      <div className="mt-3 flex gap-4">
        <button
          type="button"
          className={SUBTLE}
          onClick={() => void run(() => api.setRuleEnded(rule.id, rule.ended_on ? null : today), "更新に失敗しました")}
        >
          {rule.ended_on ? "再開する" : "やめた日を今日にする"}
        </button>
        <button type="button" className={SUBTLE} onClick={() => setConfirmDelete(true)}>
          削除
        </button>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        message="この項目を削除します。よろしいですか？"
        confirmLabel="削除する"
        cancelLabel="やめる"
        onConfirm={async () => {
          setConfirmDelete(false);
          await run(() => api.deleteRule(rule.id), "削除に失敗しました");
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </article>
  );
}

export interface RulesBoardChild {
  id: string;
  name: string;
}

// 「試したこと」と検討事項ボードの画面(あさノート・よるノート共通)。
// 表示と操作はここ。テーブル(api)・ログイン状態・子ども・前後比較の中身はアプリから渡す。
export function RulesBoardView({
  api,
  signedIn,
  authLoading,
  childList,
  authStatus,
  rulePlaceholder,
  renderComparison,
}: {
  api: BoardApi;
  signedIn: boolean;
  authLoading: boolean;
  childList: readonly RulesBoardChild[];
  /** 見出しの右に置く、ログイン状態の表示(各アプリの AuthStatus)。 */
  authStatus: ReactNode;
  /** 「試したこと」の入力欄の例。 */
  rulePlaceholder: string;
  /** 1件ぶんの前後比較の表示。today は "YYYY-MM-DD"。 */
  renderComparison: (rule: Rule, today: string) => ReactNode;
}) {
  const today = useMemo(() => toDateInputValue(new Date()), []);

  const [rules, setRules] = useState<Rule[] | null>(null);
  const [concerns, setConcerns] = useState<Concern[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [ruleTitle, setRuleTitle] = useState("");
  const [ruleStart, setRuleStart] = useState(today);
  const [ruleChild, setRuleChild] = useState<string>("");
  const [concernTitle, setConcernTitle] = useState("");
  const [concernChild, setConcernChild] = useState<string>("");
  const [pendingConcernDelete, setPendingConcernDelete] = useState<Concern | null>(null);

  const reload = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([api.getRules(), api.getConcerns()]);
      setRules(r);
      setConcerns(c);
    } catch (e) {
      console.error(e);
      setError(describeErrorForUser(e, "読み込みに失敗しました(オンラインでご利用ください)"));
      setRules((cur) => cur ?? []);
      setConcerns((cur) => cur ?? []);
    }
  }, [api]);

  useEffect(() => {
    if (authLoading || !signedIn) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- マウント/ログイン確定後の初回取得
    void reload();
  }, [authLoading, signedIn, reload]);

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

  const childName = (id: string | null) => (id ? (childList.find((c) => c.id === id)?.name ?? null) : null);
  const open = concerns?.filter((c) => !c.resolved_at) ?? [];
  const resolved = concerns?.filter((c) => c.resolved_at) ?? [];

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6">
      <header className="flex items-start justify-between gap-3">
        <h1 className="text-lg font-bold">💡 試したこと</h1>
        {authStatus}
      </header>

      {!authLoading && !signedIn && <p className={`${CARD} text-sm text-[var(--sub)]`}>ログインすると、家族で共有できます。</p>}
      {error && (
        <p role="alert" className="rounded-2xl bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--sub)]">
          {error}
        </p>
      )}

      {signedIn &&
        (rules === null || concerns === null ? (
          <SkeletonList />
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <form
                className={`${CARD} flex flex-col gap-2.5`}
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit(
                    () => api.createRule({ title: ruleTitle, startedOn: ruleStart, childId: ruleChild || null }),
                    "登録に失敗しました",
                    () => setRuleTitle("")
                  );
                }}
              >
                <input
                  className={INPUT}
                  placeholder={rulePlaceholder}
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
                  api={api}
                  rule={r}
                  childName={childList.length >= 2 ? childName(r.child_id) : null}
                  today={today}
                  comparison={renderComparison(r, today)}
                  onChanged={() => void reload()}
                  onError={setError}
                />
              ))}
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-bold">検討事項ボード</h2>
              <form
                className={`${CARD} flex flex-col gap-2.5`}
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit(
                    () => api.createConcern({ title: concernTitle, childId: concernChild || null }),
                    "追加に失敗しました",
                    () => setConcernTitle("")
                  );
                }}
              >
                <div className="flex gap-2">
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
                </div>
                {childList.length >= 2 && (
                  <select
                    className={INPUT}
                    value={concernChild}
                    onChange={(e) => setConcernChild(e.target.value)}
                    aria-label="検討事項の対象の子ども"
                  >
                    <option value="">全員</option>
                    {childList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </form>
              <ul className="flex flex-col gap-2">
                {[...open, ...resolved].map((c) => {
                  const done = !!c.resolved_at;
                  const target = childList.length >= 2 ? childName(c.child_id) : null;
                  return (
                    <li key={c.id} className={`${CARD} flex items-center gap-3 py-3`}>
                      <input
                        type="checkbox"
                        className="h-5 w-5 flex-none"
                        checked={done}
                        aria-label={`${c.title}を解決済みにする`}
                        onChange={() => void submit(() => api.setConcernResolved(c.id, !done), "更新に失敗しました", () => {})}
                      />
                      <span className="flex-1">
                        <span className={`text-sm ${done ? "text-[var(--sub)] line-through" : ""}`}>{c.title}</span>
                        {target && <span className="ml-2 text-[11px] text-[var(--sub)]">{target}</span>}
                      </span>
                      <button type="button" className={SUBTLE} onClick={() => setPendingConcernDelete(c)}>
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

      <ConfirmDialog
        open={pendingConcernDelete !== null}
        message="この項目を削除します。よろしいですか？"
        confirmLabel="削除する"
        cancelLabel="やめる"
        onConfirm={async () => {
          const target = pendingConcernDelete;
          setPendingConcernDelete(null);
          if (target) await submit(() => api.deleteConcern(target.id), "削除に失敗しました", () => {});
        }}
        onCancel={() => setPendingConcernDelete(null)}
      />
    </main>
  );
}
