"use client";

import Link from "next/link";
import { LoadingView } from "@note/core/components/LoadingView";
import { JoinFamilyView } from "@/components/JoinFamilyView";
import { ParentHome } from "@/components/ParentHome";
import { SignOutButton } from "@/components/SignOutButton";
import { releases } from "@/data/releases";
import { ROLE_LABELS } from "@/lib/db/family";
import { describeServerError } from "@/lib/errors";
import { useMembership } from "@/lib/membership";

// ホーム。ログイン・家族への参加の状態で出し分ける。親には記録への入口と直近7日の状況を出す。家族向けの閲覧はタスク9。
// 出し分けは表示のためだけで、権限の検証はサーバー(RLS と DB の関数)が行う。
export default function Home() {
  const { state, refresh } = useMembership();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 pt-12 pb-10">
      <header>
        <h1 className="text-2xl font-bold">おやノート</h1>
        <p className="mt-2 text-base leading-relaxed text-[var(--sub)]">毎日のようすを記録して、家族と共有するためのアプリです。</p>
      </header>

      {state.status === "loading" && <LoadingView />}

      {state.status === "signed-out" && (
        <section className="flex flex-col gap-3">
          <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-base leading-relaxed">
            はじめに、メールアドレスでログインしてください。
          </p>
          <Link
            href="/login"
            className="min-h-12 rounded-full bg-[var(--accent)] py-4 text-center text-lg font-bold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent-soft)]"
          >
            ログインする
          </Link>
        </section>
      )}

      {state.status === "no-family" && (
        <>
          <JoinFamilyView />
          <SignOutButton />
        </>
      )}

      {state.status === "error" && (
        <section className="flex flex-col gap-3">
          <p role="alert" className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-base leading-relaxed">
            {describeServerError(state.error, "家族の情報を読み込めませんでした。")}
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="min-h-12 rounded-full bg-[var(--accent)] py-4 text-lg font-bold text-[var(--accent-ink)]"
          >
            もう一度読み込む
          </button>
          <SignOutButton />
        </section>
      )}

      {state.status === "member" && (
        <section className="flex flex-col gap-4">
          <p className="rounded-2xl bg-[var(--surface)] px-4 py-5 text-lg">
            <span className="font-bold">{state.member.displayName}</span> さん
            <span className="mt-1 block text-base text-[var(--sub)]">{ROLE_LABELS[state.member.role]}</span>
          </p>
          {state.member.role === "parent" ? (
            <ParentHome userId={state.userId} />
          ) : (
            <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-base leading-relaxed">父・母の記録を見る機能は、ただいま準備中です。</p>
          )}
          {state.member.role === "admin" && (
            <Link
              href="/photos"
              className="min-h-12 rounded-full bg-[var(--surface-2)] py-4 text-center text-lg font-bold text-[var(--ink)] focus:ring-2 focus:ring-[var(--accent)]"
            >
              孫の写真の管理
            </Link>
          )}
          <Link
            href="/family"
            className="min-h-12 rounded-full bg-[var(--surface-2)] py-4 text-center text-lg font-bold text-[var(--ink)] focus:ring-2 focus:ring-[var(--accent)]"
          >
            {state.member.role === "admin" ? "家族の管理(招待・メンバー)" : "家族のメンバー"}
          </Link>
          <SignOutButton />
        </section>
      )}

      <Link href="/updates" className="self-start text-sm text-[var(--accent)] underline underline-offset-2">
        更新履歴(v{releases[0]?.version})
      </Link>
    </main>
  );
}
