"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDateLabel } from "@note/core/date";
import { recordSummary } from "@/components/RecordDetails";
import { fetchFamilyMembers, type Member } from "@/lib/db/family";
import { fetchRecordsInRange, type DailyRecord } from "@/lib/db/records";
import { describeServerError } from "@/lib/errors";
import { loadFamilyViewState, saveFamilyViewState } from "@/lib/familyViewState";
import { todayJst } from "@/lib/jst";
import { DAY_STATE_LABELS, datesToShow, dayState, periodOf, summarize, type PeriodKind } from "@/lib/recordStats";

/**
 * 家族管理者・閲覧者のホーム(SPEC §6)。父・母を切り替えて、週(今日までの7日ずつ)・月ごとの集計と、
 * 日ごとの状況を見る。日を押すと、その日の記録の中身(/view)を開く。
 * 読めるかどうかはサーバー(RLS)が決める(家族管理者・閲覧者は、同じ家族の父・母の記録を読める)。
 */
export function FamilyHome() {
  const today = todayJst();
  const [parents, setParents] = useState<Member[] | null>(null);
  const [initial] = useState(loadFamilyViewState);
  const [selectedId, setSelectedId] = useState<string | null>(initial.parentId);
  const [kind, setKind] = useState<PeriodKind>(initial.kind);
  const [offset, setOffset] = useState(initial.offset);
  const [records, setRecords] = useState<{ key: string; list: DailyRecord[] } | null>(null);
  const [error, setError] = useState<unknown>(null);

  const period = periodOf(kind, offset, today);
  const selected = parents?.find((p) => p.userId === selectedId) ?? null;
  const loadKey = selected ? `${selected.userId}:${period.from}:${period.to}` : null;

  useEffect(() => {
    let cancelled = false;
    fetchFamilyMembers()
      .then((members) => {
        if (cancelled) return;
        const list = members.filter((m) => m.role === "parent");
        setParents(list);
        // 覚えていた親が家族にいなければ(外れた・役割が変わった)、最初の親にする。
        setSelectedId((current) => (list.some((m) => m.userId === current) ? current : (list[0]?.userId ?? null)));
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selected || !loadKey) return;
    let cancelled = false;
    fetchRecordsInRange(selected.userId, period.from, period.to)
      .then((list) => {
        if (cancelled) return;
        setError(null);
        setRecords({ key: loadKey, list });
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
    };
    // loadKey が親・期間をまとめて表す。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey]);

  useEffect(() => {
    saveFamilyViewState({ parentId: selectedId, kind, offset });
  }, [selectedId, kind, offset]);

  const current = records?.key === loadKey ? records.list : null;
  const byDate = useMemo(() => new Map((current ?? []).map((r) => [r.recordDate, r])), [current]);
  const joinedOn = selected ? todayJst(new Date(selected.joinedAt)) : undefined;
  const dates = datesToShow(period.from, period.to, byDate, joinedOn);
  const summary = current ? summarize(dates, byDate) : null;

  if (error !== null && parents === null) {
    return <p role="alert" className="text-base text-[var(--holiday)]">{describeServerError(error, "家族の情報を読み込めませんでした。")}</p>;
  }
  if (parents === null) return <p className="text-base text-[var(--sub)]">読み込み中...</p>;
  if (parents.length === 0) {
    return (
      <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-base leading-relaxed">
        まだ親(記録する人)が家族に参加していません。家族管理者が「家族の管理」から招待すると、ここで記録を見られるようになります。
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div role="group" aria-label="見る人" className="grid grid-cols-2 gap-2">
        {parents.map((parent) => (
          <button
            key={parent.userId}
            type="button"
            aria-pressed={parent.userId === selectedId}
            onClick={() => setSelectedId(parent.userId)}
            className={`min-h-14 rounded-2xl px-2 text-xl font-bold ${
              parent.userId === selectedId ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "bg-[var(--surface-2)] text-[var(--ink)]"
            }`}
          >
            {parent.displayName}
          </button>
        ))}
      </div>

      <div role="group" aria-label="集計の単位" className="grid grid-cols-2 gap-2">
        {(["week", "month"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === kind}
            onClick={() => {
              setKind(k);
              setOffset(0);
            }}
            className={`min-h-12 rounded-full text-base font-bold ${
              k === kind ? "bg-[var(--ink)] text-[var(--surface)]" : "bg-[var(--surface-2)] text-[var(--ink)]"
            }`}
          >
            {k === "week" ? "週ごと" : "月ごと"}
          </button>
        ))}
      </div>

      <nav aria-label="期間の切り替え" className="flex items-center justify-between gap-2 text-base">
        <button type="button" onClick={() => setOffset(offset + 1)} className="min-h-12 text-[var(--accent)] underline underline-offset-2">
          ← 前{kind === "week" ? "の週" : "の月"}
        </button>
        <h2 className="text-lg font-bold">{period.label}</h2>
        {offset > 0 ? (
          <button type="button" onClick={() => setOffset(offset - 1)} className="min-h-12 text-[var(--accent)] underline underline-offset-2">
            次{kind === "week" ? "の週" : "の月"} →
          </button>
        ) : (
          <span className="w-16" />
        )}
      </nav>

      {error !== null && <p role="alert" className="text-base text-[var(--holiday)]">{describeServerError(error, "記録を読み込めませんでした。")}</p>}

      {summary ? (
        <section aria-label={`${selected?.displayName}さんの${period.label}の集計`} className="flex flex-col gap-2 rounded-2xl bg-[var(--surface)] p-4">
          <dl className="grid grid-cols-2 gap-3">
            <Stat label="完了" value={summary.completed} />
            <Stat label="途中まで" value={summary.partial} />
            <Stat label="未記録" value={summary.none} />
            <Stat label="お薬を飲んでいない" value={summary.medicationNotTaken} />
          </dl>
          <p className="text-sm leading-relaxed text-[var(--sub)]">
            「途中まで」は、記録はあるが完了していない日です。未記録の日は、記録が無いだけで、体調やお薬のようすは分かりません。
          </p>
        </section>
      ) : (
        error === null && <p className="text-base text-[var(--sub)]">読み込み中...</p>
      )}

      {current && dates.length === 0 && (
        <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-base">この期間は、{selected?.displayName}さんが家族に参加する前です。</p>
      )}

      {current && dates.length > 0 && (
        <ul aria-label="日ごとの記録" className="flex flex-col gap-2">
          {dates.map((date) => {
            const record = byDate.get(date);
            const state = dayState(record);
            return (
              <li key={date}>
                <Link
                  href={`/view?user=${selected?.userId}&date=${date}`}
                  className="flex min-h-12 flex-col rounded-2xl bg-[var(--surface)] px-4 py-3 text-base focus:ring-2 focus:ring-[var(--accent)]"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span>{date === today ? `今日(${formatDateLabel(date)})` : formatDateLabel(date)}</span>
                    <span className={state === "completed" ? "font-bold text-[var(--calm)]" : "text-[var(--sub)]"}>{DAY_STATE_LABELS[state]}</span>
                  </span>
                  {record && <span className="mt-1 text-sm text-[var(--sub)]">{recordSummary(record)}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col rounded-xl bg-[var(--surface-2)] px-3 py-2">
      <dt className="text-sm text-[var(--sub)] [word-break:auto-phrase]">{label}</dt>
      <dd className="text-2xl font-bold">
        {value}
        <span className="ml-1 text-base font-normal">日</span>
      </dd>
    </div>
  );
}
