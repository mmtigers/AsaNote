"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { formatDateLabel } from "@note/core/date";
import { LoadingView } from "@note/core/components/LoadingView";
import { RecordForm } from "@/components/RecordForm";
import { addDaysToDate, isFutureJst, isValidDateString, todayJst } from "@/lib/jst";
import { useMembership } from "@/lib/membership";

// 1日の記録の画面(/record?date=YYYY-MM-DD)。日付が無い・正しくない・未来なら、日本時間の今日にする。
// 記録できるのは親だけ(画面の出し分けは表示のためで、サーバーも親以外の書き込みを拒否する)。
function RecordPageContent() {
  const params = useSearchParams();
  const { state } = useMembership();
  const today = todayJst();
  const requested = params.get("date") ?? "";
  const date = isValidDateString(requested) && !isFutureJst(requested) ? requested : today;

  if (state.status === "loading") return <LoadingView />;
  if (state.status !== "member" || state.member.role !== "parent") {
    return (
      <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-base leading-relaxed">
        {state.status === "signed-out" ? "ログインすると、記録をつけられます。" : "記録をつけられるのは、親(記録する人)だけです。"}{" "}
        <Link href={state.status === "signed-out" ? "/login" : "/"} className="text-[var(--accent)] underline underline-offset-2">
          {state.status === "signed-out" ? "ログインする" : "ホームへ"}
        </Link>
      </p>
    );
  }

  const prev = addDaysToDate(date, -1);
  const next = addDaysToDate(date, 1);

  return (
    <>
      <header className="flex flex-col gap-3">
        <Link href="/" className="self-start text-base text-[var(--accent)] underline underline-offset-2">
          ← ホームに戻る
        </Link>
        <h1 className="text-2xl font-bold">
          {formatDateLabel(date)}
          {date === today && <span className="ml-2 text-lg">(今日)</span>}
        </h1>
        <nav aria-label="日付の切り替え" className="flex justify-between text-base">
          <Link href={`/record?date=${prev}`} className="text-[var(--accent)] underline underline-offset-2">
            ← 前の日
          </Link>
          {date < today && (
            <Link href={`/record?date=${next}`} className="text-[var(--accent)] underline underline-offset-2">
              次の日 →
            </Link>
          )}
        </nav>
      </header>
      <RecordForm key={date} userId={state.userId} familyId={state.member.familyId} recordDate={date} />
    </>
  );
}

export default function RecordPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 pt-6 pb-16">
      <Suspense fallback={<LoadingView />}>
        <RecordPageContent />
      </Suspense>
    </main>
  );
}
