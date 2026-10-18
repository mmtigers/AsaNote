"use client";

import Link from "next/link";
import { LoadingView } from "@note/core/components/LoadingView";
import { FamilyView } from "@/components/FamilyView";
import { useMembership } from "@/lib/membership";

export default function FamilyPage() {
  const { state, refresh } = useMembership();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 pt-8 pb-10">
      <header>
        <h1 className="text-xl font-bold">家族</h1>
      </header>
      {state.status === "loading" && <LoadingView />}
      {state.status === "member" ? (
        <FamilyView me={state.member} onChanged={refresh} />
      ) : (
        state.status !== "loading" && (
          <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-base leading-relaxed">
            {state.status === "signed-out" ? "ログインすると、家族のメンバーを確認できます。" : "まだ家族に参加していません。"}{" "}
            <Link href={state.status === "signed-out" ? "/login" : "/"} className="text-[var(--accent)] underline underline-offset-2">
              {state.status === "signed-out" ? "ログインする" : "ホームへ"}
            </Link>
          </p>
        )
      )}
    </main>
  );
}
