"use client";

import Link from "next/link";
import { Skeleton } from "@note/core/components/Skeleton";
import { AppHeader } from "@/components/AppHeader";
import { SignInPrompt } from "@/components/SignInPrompt";
import { releases } from "@/data/releases";
import { fiscalYear, formatAge, roomName } from "@/lib/age";
import { museumNameOf } from "@/lib/db/childProfiles";
import { todayString } from "@/lib/today";
import { useChildProfiles } from "@/lib/useChildProfiles";

// ホーム(美術館)。SPEC §5.1。いまは、お子さまごとの館の入口まで(作品の一覧は、収蔵を作るときに足す)。
export default function Home() {
  const { profiles, error, authLoading, signedIn } = useChildProfiles();
  const today = todayString();

  return (
    <>
      <AppHeader>
        <p className="text-[15px] font-bold">〜おうちの美術館〜</p>
      </AppHeader>

      <main className="mx-auto flex max-w-md flex-col gap-3 px-4 pt-4 pb-10">
        {authLoading || (signedIn && profiles === null) ? (
          <>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </>
        ) : !signedIn ? (
          <>
            <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5">
              <p className="text-[15px] leading-relaxed">
                子どもが園や学校から持ち帰った絵や工作を、写真で「収蔵」して、額縁に入れて見返せるアプリです。
              </p>
            </section>
            <SignInPrompt message="作品を収蔵するには、ログインしてください。" />
          </>
        ) : (
          <>
            {error && (
              <p role="alert" className="rounded-xl bg-[var(--holiday-soft)] px-4 py-3 text-sm text-[var(--holiday)]">
                {error}
              </p>
            )}
            {profiles && profiles.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {profiles.map((profile) => (
                  <li key={profile.id}>
                    <section className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5">
                      <span aria-hidden="true" className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-[var(--accent-soft)] text-xl">
                        🖼️
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-[17px] font-bold">{museumNameOf(profile)}</h2>
                        <p className="text-xs text-[var(--sub)]">
                          {profile.name}
                          {profile.birth_date
                            ? ` ・ いま${formatAge(profile.birth_date, today)} ・ ${roomName(profile.birth_date, fiscalYear(today))}`
                            : " ・ 誕生日を入れると、年齢と学年がわかります"}
                        </p>
                      </div>
                    </section>
                  </li>
                ))}
              </ul>
            ) : (
              <section className="flex flex-col gap-3 rounded-2xl bg-[var(--surface-2)] px-4 py-5 text-center">
                <p className="text-sm leading-relaxed text-[var(--sub)]">
                  まだお子さまが登録されていません。「共有」から、お子さまを登録すると、その子の美術館ができます。
                </p>
                <Link href="/group" className="self-center rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-[var(--accent-ink)]">
                  お子さまを登録する
                </Link>
              </section>
            )}
            <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-4 text-center text-sm leading-relaxed text-[var(--sub)]">
              作品の収蔵と、額縁に入れた一覧は、ただいま準備中です。
            </p>
          </>
        )}

        <Link href="/updates" className="self-start text-xs text-[var(--accent)] underline underline-offset-2">
          更新履歴(v{releases[0]?.version})
        </Link>
      </main>
    </>
  );
}
