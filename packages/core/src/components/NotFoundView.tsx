import Link from "next/link";

// 存在しないURLと、notFound() が投げられたときの404画面。
// 既定のままだと英語・素のスタイルの画面が出るため、アプリの見た目と日本語に揃える。
// アプリの app/not-found.tsx から、この画面を返す。
export function NotFoundView() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-12">
      <h1 className="text-lg font-bold">ページが見つかりません</h1>
      <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-sm leading-relaxed text-[var(--sub)]">
        お探しのページは移動したか、URLが間違っている可能性があります。
      </p>
      <Link
        href="/"
        className="rounded-full bg-[var(--accent)] py-3 text-center text-sm font-bold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent)]"
      >
        ホームへ戻る
      </Link>
    </main>
  );
}
