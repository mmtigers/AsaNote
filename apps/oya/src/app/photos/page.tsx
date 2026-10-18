"use client";

import Link from "next/link";
import { LoadingView } from "@note/core/components/LoadingView";
import { PhotoManager } from "@/components/PhotoManager";
import { useMembership } from "@/lib/membership";

// 孫の写真の管理(家族管理者だけ)。出し分けは表示のためだけで、権限の検証はサーバー(RLS)が行う。
export default function PhotosPage() {
  const { state } = useMembership();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 pt-8 pb-10">
      <header>
        <h1 className="text-xl font-bold">孫の写真</h1>
      </header>
      {state.status === "loading" && <LoadingView />}
      {state.status === "member" && state.member.role === "admin" ? (
        <PhotoManager familyId={state.member.familyId} />
      ) : (
        state.status !== "loading" && (
          <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-base leading-relaxed">
            {state.status === "signed-out" ? "ログインしてください。" : "写真の管理は、家族管理者だけができます。"}{" "}
            <Link href={state.status === "signed-out" ? "/login" : "/"} className="text-[var(--accent)] underline underline-offset-2">
              {state.status === "signed-out" ? "ログインする" : "ホームへ"}
            </Link>
          </p>
        )
      )}
      <Link href="/" className="self-start text-base text-[var(--accent)] underline underline-offset-2">
        ← ホームに戻る
      </Link>
    </main>
  );
}
