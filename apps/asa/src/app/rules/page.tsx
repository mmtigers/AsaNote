"use client";

import { useMemo } from "react";
import { AuthStatus } from "@/components/AuthStatus";
import { RuleComparisonPanel, RulesBoardView, type RulePeriodView } from "@note/core/components/RulesBoardView";
import type { Rule } from "@note/core/board";
import { useAuth } from "@/lib/auth/AuthProvider";
import { boardApi } from "@/lib/db/board";
import { useChildren } from "@/lib/db/children";
import { useRecordsTimeline } from "@/lib/db/queries";
import { compareAroundRule, COMPARE_WINDOW_DAYS, type PeriodSummary } from "./compare";

type TimelineRecords = NonNullable<ReturnType<typeof useRecordsTimeline>>;

function toView(p: PeriodSummary): RulePeriodView {
  return {
    from: p.from,
    to: p.to,
    total: p.total,
    rate: p.reluctantRate,
    rateCaption: `行き渋り(${p.total}件中)`,
    detail: p.commonWake === null ? "起床 -" : `起床 ${p.commonWake.label}`,
    detailNote: p.commonWake === null ? null : `(最も多い帯・${p.wakeCount}件中${p.commonWake.count}件)`,
  };
}

// 前後比較(「行き渋った」「行かなかった」の割合と、最も多い起床の時間帯)。
function RuleComparison({ rule, records, today }: { rule: Rule; records: TimelineRecords; today: string }) {
  const comparison = useMemo(() => {
    const scoped = records.filter((r) => rule.child_id === null || r.childId === rule.child_id);
    return compareAroundRule(scoped, { startedOn: rule.started_on, endedOn: rule.ended_on }, today);
  }, [records, rule, today]);
  return <RuleComparisonPanel before={toView(comparison.before)} after={toView(comparison.after)} windowDays={COMPARE_WINDOW_DAYS} />;
}

// 画面は @note/core(よるノートと共通)。テーブル・子ども・前後比較の中身は、あさノートのものを渡す。
export default function RulesPage() {
  const { session, loading: authLoading } = useAuth();
  const children = useChildren();
  const records = useRecordsTimeline();
  return (
    <RulesBoardView
      api={boardApi}
      signedIn={!!session}
      authLoading={authLoading}
      childList={children ?? []}
      authStatus={<AuthStatus />}
      rulePlaceholder="例: 前の晩に持ち物をそろえる"
      renderComparison={(rule, today) => <RuleComparison rule={rule} records={records ?? []} today={today} />}
    />
  );
}
