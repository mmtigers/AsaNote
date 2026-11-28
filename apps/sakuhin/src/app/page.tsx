import Link from "next/link";
import { releases } from "@/data/releases";

// 土台の段階のホーム。ヘッダーの形は、あさノートの RecordHeader にそろえる(docs/SPEC.md §6.3)。
// 美術館・収蔵・ログインは、タスク4以降で追加する(docs/SPEC.md §13)。
export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--bg)]/95 px-4 pt-5 pb-3 backdrop-blur-sm">
        <div className="mx-auto max-w-md">
          <h1 className="whitespace-nowrap text-xl font-bold">🎨 さくひんノート</h1>
          <p className="mt-3 text-[15px] font-bold">〜おうちの美術館〜</p>
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col gap-3 px-4 pt-4 pb-10">
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5">
          <p className="text-[15px] leading-relaxed">
            子どもが園や学校から持ち帰った絵や工作を、写真で「収蔵」して、額縁に入れて見返せるアプリです。
          </p>
        </section>

        <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-center text-sm leading-relaxed text-[var(--sub)]">
          ただいま準備中です。作品の収蔵や美術館の機能は、これから順に追加します。
        </p>

        <Link href="/updates" className="self-start text-xs text-[var(--accent)] underline underline-offset-2">
          更新履歴(v{releases[0]?.version})
        </Link>
      </main>
    </>
  );
}
