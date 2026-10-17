import Link from "next/link";
import { releases } from "@/data/releases";

// 土台の段階のホーム。記録・ログインはタスク4以降で追加する(docs/SPEC.md §12)。
export default function Home() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 pt-12 pb-10">
      <header>
        <h1 className="text-2xl font-bold">おやノート</h1>
        <p className="mt-2 text-base leading-relaxed text-[var(--sub)]">毎日のようすを記録して、家族と共有するためのアプリです。</p>
      </header>

      <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-base leading-relaxed">
        ただいま準備中です。記録の機能は、これから順に追加します。
      </p>

      <Link href="/updates" className="self-start text-sm text-[var(--accent)] underline underline-offset-2">
        更新履歴(v{releases[0]?.version})
      </Link>
    </main>
  );
}
