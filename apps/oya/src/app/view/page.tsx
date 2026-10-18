"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { formatDateLabel } from "@note/core/date";
import { LoadingView } from "@note/core/components/LoadingView";
import { RecordViewer } from "@/components/RecordViewer";
import { fetchFamilyMembers, type Member } from "@/lib/db/family";
import { addDaysToDate, isFutureJst, isValidDateString, todayJst } from "@/lib/jst";
import { useMembership } from "@/lib/membership";

// 父・母の1日の記録を見る画面(/view?user=<親の id>&date=YYYY-MM-DD。家族管理者・閲覧者)。
// 日付が無い・正しくない・未来なら、日本時間の今日にする。読めるかどうかはサーバー(RLS)が決める。
function ViewPageContent() {
  const params = useSearchParams();
  const { state } = useMembership();
  const [members, setMembers] = useState<Member[] | null>(null);
  const today = todayJst();
  const userId = params.get("user") ?? "";
  const requested = params.get("date") ?? "";
  const date = isValidDateString(requested) && !isFutureJst(requested) ? requested : today;
  const canView = state.status === "member" && state.member.role !== "parent";

  useEffect(() => {
    if (!canView) return;
    fetchFamilyMembers()
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [canView]);

  if (state.status === "loading") return <LoadingView />;
  if (!canView) {
    const isParent = state.status === "member";
    return (
      <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-base leading-relaxed">
        {state.status === "signed-out" ? "ログインしてください。" : isParent ? "自分の記録は、ホームから開けます。" : "まだ家族に参加していません。"}{" "}
        <Link href={state.status === "signed-out" ? "/login" : "/"} className="text-[var(--accent)] underline underline-offset-2">
          {state.status === "signed-out" ? "ログインする" : "ホームへ"}
        </Link>
      </p>
    );
  }

  // 家族から外れた親は、一覧に名前が無い(記録は読める。SPEC §7)。
  const name = members?.find((m) => m.userId === userId)?.displayName ?? (members ? "以前のメンバー" : "");
  const href = (d: string) => `/view?user=${encodeURIComponent(userId)}&date=${d}`;

  return (
    <>
      <header className="flex flex-col gap-3">
        <Link href="/" className="self-start text-base text-[var(--accent)] underline underline-offset-2">
          ← ホームに戻る
        </Link>
        <p className="text-lg font-bold">{name && `${name}さんの記録`}</p>
        <h1 className="text-2xl font-bold">
          {formatDateLabel(date)}
          {date === today && <span className="ml-2 text-lg">(今日)</span>}
        </h1>
        <nav aria-label="日付の切り替え" className="flex justify-between text-base">
          <Link href={href(addDaysToDate(date, -1))} className="text-[var(--accent)] underline underline-offset-2">
            ← 前の日
          </Link>
          {date < today && (
            <Link href={href(addDaysToDate(date, 1))} className="text-[var(--accent)] underline underline-offset-2">
              次の日 →
            </Link>
          )}
        </nav>
      </header>
      {userId ? (
        <RecordViewer key={`${userId}:${date}`} userId={userId} recordDate={date} />
      ) : (
        <p className="text-base">見る人が選ばれていません。ホームから選んでください。</p>
      )}
    </>
  );
}

export default function ViewPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 pt-6 pb-16">
      <Suspense fallback={<LoadingView />}>
        <ViewPageContent />
      </Suspense>
    </main>
  );
}
